use std::{
    fs,
    io::{self, Write},
    path::Path,
};

// The temporary file lives beside its destination. Never delete the destination first:
// std::fs::rename supports replacing a file on Windows as well as Unix.
pub fn atomic_write(path: &Path, bytes: &[u8]) -> io::Result<()> {
    atomic_write_with(path, bytes, |temporary, destination| {
        fs::rename(temporary, destination)
    })
}
fn atomic_write_with<F>(path: &Path, bytes: &[u8], replace: F) -> io::Result<()>
where
    F: FnOnce(&Path, &Path) -> io::Result<()>,
{
    if let Some(parent) = path.parent().filter(|p| !p.as_os_str().is_empty()) {
        fs::create_dir_all(parent)?;
    }
    let temporary = path.with_extension("tmp");
    let result = (|| {
        let mut options = fs::OpenOptions::new();
        options.write(true).create(true).truncate(true);
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            options.mode(0o600);
        }
        let mut file = options.open(&temporary)?;
        file.write_all(bytes)?;
        file.sync_all()?;
        drop(file);
        replace(&temporary, path)
    })();
    if result.is_err() {
        let _ = fs::remove_file(&temporary);
    }
    result
}
#[cfg(test)]
mod tests {
    use super::*;
    fn directory(label: &str) -> std::path::PathBuf {
        std::env::temp_dir().join(format!(
            "patent-storage-{label}-{}-{}",
            std::process::id(),
            crate::core::now()
        ))
    }
    #[test]
    fn replacing_existing_history_keeps_new_data_and_removes_temporary_file() {
        let dir = directory("replace");
        let path = dir.join("历史 公开.json");
        atomic_write(&path, b"first").unwrap();
        atomic_write(&path, b"second").unwrap();
        assert_eq!(fs::read(&path).unwrap(), b"second");
        assert!(!path.with_extension("tmp").exists());
        fs::remove_dir_all(dir).unwrap();
    }
    #[test]
    fn failed_replacement_preserves_previous_history_and_cleans_new_temporary_data() {
        let dir = directory("failure");
        let path = dir.join("state-v1.json");
        atomic_write(&path, b"previous public fixture").unwrap();
        let result = atomic_write_with(&path, b"new fixture", |temporary, destination| {
            assert_eq!(fs::read(destination).unwrap(), b"previous public fixture");
            assert_eq!(fs::read(temporary).unwrap(), b"new fixture");
            Err(io::Error::new(
                io::ErrorKind::PermissionDenied,
                "injected replacement failure",
            ))
        });
        assert!(result.is_err());
        assert_eq!(fs::read(&path).unwrap(), b"previous public fixture");
        assert!(!path.with_extension("tmp").exists());
        fs::remove_dir_all(dir).unwrap();
    }
}
