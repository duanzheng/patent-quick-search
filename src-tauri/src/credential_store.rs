use crate::{
    core::{valid_key, ApiError},
    session::SessionCredential,
};
use serde::{Deserialize, Serialize};
use std::{
    fs,
    io::{self, Write},
    path::{Path, PathBuf},
    sync::atomic::{AtomicU64, Ordering},
};
use zeroize::{Zeroize, Zeroizing};
const MAX_FILE: u64 = 1024 * 1024;
static NEXT: AtomicU64 = AtomicU64::new(0);
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Record {
    schema_version: u8,
    key: String,
}
impl Drop for Record {
    fn drop(&mut self) {
        self.key.zeroize();
    }
}
// The persistent file is explicitly plaintext, as accepted by the user.
// Requests use only this cache; neither Search nor balance opens the file.
pub struct CredentialStore {
    cache: SessionCredential,
    path: Option<PathBuf>,
    error: Option<String>,
}
impl CredentialStore {
    pub fn disabled() -> Self {
        Self {
            cache: SessionCredential::default(),
            path: None,
            error: None,
        }
    }
    pub fn open(path: PathBuf) -> Self {
        let mut store = Self {
            cache: SessionCredential::default(),
            path: Some(path.clone()),
            error: None,
        };
        match read(&path) {
            Ok(Some(value)) => {
                if store.cache.replace(&value).is_err() {
                    store.error = Some("本地密钥无法读取，请在设置中重新保存。".into());
                }
            }
            Ok(None) => (),
            Err(()) => store.error = Some("本地密钥无法读取，请在设置中重新保存。".into()),
        }
        store
    }
    #[cfg(test)]
    pub fn is_configured(&self) -> bool {
        self.cache.is_configured()
    }
    pub fn error(&self) -> Option<&str> {
        self.error.as_deref()
    }
    pub fn copy_for_request(&self) -> Result<Zeroizing<String>, ApiError> {
        self.cache.copy_for_request()
    }
    pub fn replace(&mut self, input: &str) -> Result<(), String> {
        let checked = Zeroizing::new(valid_key(input)?);
        if let Some(path) = &self.path {
            write(path, &checked)
                .map_err(|_| "无法保存本地密钥，请检查磁盘权限后重试。".to_string())?;
        }
        self.cache.replace(&checked)?;
        self.error = None;
        Ok(())
    }
    pub fn clear(&mut self) -> Result<(), String> {
        if let Some(path) = &self.path {
            match fs::symlink_metadata(path) {
                Ok(meta) if meta.is_file() && !meta.file_type().is_symlink() => {
                    fs::remove_file(path)
                        .map_err(|_| "无法清除本地密钥，请检查磁盘权限后重试。".to_string())?
                }
                Ok(_) => return Err("无法清除本地密钥，请检查配置文件。".into()),
                Err(e) if e.kind() == io::ErrorKind::NotFound => (),
                Err(_) => return Err("无法清除本地密钥，请检查磁盘权限后重试。".into()),
            }
        }
        self.clear_memory();
        self.error = None;
        Ok(())
    }
    pub fn clear_memory(&mut self) {
        self.cache.clear();
    }
}
fn read(path: &Path) -> Result<Option<Zeroizing<String>>, ()> {
    let meta = match fs::symlink_metadata(path) {
        Ok(v) => v,
        Err(e) if e.kind() == io::ErrorKind::NotFound => return Ok(None),
        Err(_) => return Err(()),
    };
    if !meta.is_file() || meta.file_type().is_symlink() || meta.len() > MAX_FILE {
        return Err(());
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        if meta.permissions().mode() & 0o077 != 0 {
            return Err(());
        }
    }
    let bytes = Zeroizing::new(fs::read(path).map_err(|_| ())?);
    let record: Record = serde_json::from_slice(&bytes).map_err(|_| ())?;
    if record.schema_version != 1 {
        return Err(());
    }
    let checked = Zeroizing::new(valid_key(&record.key).map_err(|_| ())?);
    Ok(Some(checked))
}
fn write(path: &Path, key: &str) -> io::Result<()> {
    write_with(path, key, |temporary, destination| {
        fs::rename(temporary, destination)
    })
}
fn write_with<F>(path: &Path, key: &str, replace: F) -> io::Result<()>
where
    F: FnOnce(&Path, &Path) -> io::Result<()>,
{
    let parent = path
        .parent()
        .ok_or_else(|| io::Error::other("configuration path"))?;
    let mut builder = fs::DirBuilder::new();
    builder.recursive(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::DirBuilderExt;
        builder.mode(0o700);
    }
    builder.create(parent)?;
    let directory = fs::symlink_metadata(parent)?;
    if !directory.is_dir() || directory.file_type().is_symlink() {
        return Err(io::Error::other("configuration directory"));
    }
    if let Ok(meta) = fs::symlink_metadata(path) {
        if !meta.is_file() || meta.file_type().is_symlink() {
            return Err(io::Error::other("configuration destination"));
        }
    }
    let temporary = parent.join(format!(
        ".credentials-{}-{}-{}.tmp",
        std::process::id(),
        crate::core::now(),
        NEXT.fetch_add(1, Ordering::Relaxed)
    ));
    let record = Record {
        schema_version: 1,
        key: key.to_owned(),
    };
    let bytes = Zeroizing::new(
        serde_json::to_vec(&record).map_err(|_| io::Error::other("configuration encoding"))?,
    );
    if bytes.len() as u64 > MAX_FILE {
        return Err(io::Error::other("configuration size"));
    }
    let mut created = false;
    let result = (|| {
        let mut options = fs::OpenOptions::new();
        options.write(true).create_new(true);
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            options.mode(0o600);
        }
        let mut file = options.open(&temporary)?;
        created = true;
        file.write_all(&bytes)?;
        file.sync_all()?;
        drop(file);
        replace(&temporary, path)?;
        #[cfg(unix)]
        {
            let _ = fs::File::open(parent).and_then(|file| file.sync_all());
        }
        Ok(())
    })();
    if result.is_err() && created {
        let _ = fs::remove_file(&temporary);
    }
    result
}
#[cfg(test)]
mod tests {
    use super::*;
    fn path(label: &str) -> PathBuf {
        std::env::temp_dir()
            .join(format!(
                "patent-credential-fixture-{label}-{}-{}",
                std::process::id(),
                NEXT.fetch_add(1, Ordering::Relaxed)
            ))
            .join("private/credentials-v1.json")
    }
    fn clean(path: &Path) {
        fs::remove_dir_all(path.parent().unwrap().parent().unwrap()).unwrap();
    }
    #[test]
    fn persists_reloads_and_only_explicit_clear_removes_the_file() {
        let path = path("roundtrip");
        let mut store = CredentialStore::open(path.clone());
        assert!(!store.is_configured());
        store.replace(" synthetic-local-first ").unwrap();
        store.clear_memory();
        assert!(!store.is_configured());
        let mut reopened = CredentialStore::open(path.clone());
        assert_eq!(
            reopened.copy_for_request().unwrap().as_str(),
            "synthetic-local-first"
        );
        reopened.replace("synthetic-local-second").unwrap();
        let bytes = fs::read(&path).unwrap();
        assert!(!String::from_utf8(bytes)
            .unwrap()
            .contains("synthetic-local-first"));
        assert_eq!(
            CredentialStore::open(path.clone())
                .copy_for_request()
                .unwrap()
                .as_str(),
            "synthetic-local-second"
        );
        reopened.clear().unwrap();
        assert!(!path.exists());
        assert!(!reopened.is_configured());
        assert!(!CredentialStore::open(path.clone()).is_configured());
        clean(&path);
    }
    #[test]
    fn failed_atomic_replacement_keeps_the_previous_configuration_and_cleans_temp() {
        let path = path("atomic-failure");
        write(&path, "synthetic-original-config").unwrap();
        let previous = fs::read(&path).unwrap();
        let result = write_with(
            &path,
            "synthetic-uncommitted-config",
            |temporary, destination| {
                assert_eq!(fs::read(destination).unwrap(), previous);
                assert!(temporary.is_file());
                Err(io::Error::new(
                    io::ErrorKind::PermissionDenied,
                    "injected fixture failure",
                ))
            },
        );
        assert!(result.is_err());
        assert_eq!(fs::read(&path).unwrap(), previous);
        assert_eq!(
            CredentialStore::open(path.clone())
                .copy_for_request()
                .unwrap()
                .as_str(),
            "synthetic-original-config"
        );
        assert!(!fs::read_dir(path.parent().unwrap())
            .unwrap()
            .any(|entry| entry
                .unwrap()
                .path()
                .extension()
                .is_some_and(|extension| extension == "tmp")));
        clean(&path);
    }
    #[test]
    fn configuration_is_reloaded_in_a_fresh_process() {
        const FLAG: &str = "PATENT_CREDENTIAL_RESTART_FIXTURE";
        if let Some(path) = std::env::var_os(FLAG) {
            let path = PathBuf::from(path);
            assert!(path
                .ancestors()
                .any(|part| part.file_name().is_some_and(|name| name
                    .to_string_lossy()
                    .starts_with("patent-credential-fixture-process-"))));
            let store = CredentialStore::open(path);
            assert_eq!(
                store.copy_for_request().unwrap().as_str(),
                "synthetic-fresh-process-value"
            );
            return;
        }
        let path = path("process");
        write(&path, "synthetic-fresh-process-value").unwrap();
        let result = std::process::Command::new(std::env::current_exe().unwrap())
            .args([
                "--exact",
                "credential_store::tests::configuration_is_reloaded_in_a_fresh_process",
            ])
            .env_clear()
            .env(FLAG, &path)
            .output()
            .unwrap();
        assert!(
            result.status.success(),
            "isolated credential restart fixture failed"
        );
        clean(&path);
    }
    #[test]
    fn corrupt_file_is_preserved_and_not_misreported_as_configured() {
        let path = path("corrupt");
        write(&path, "synthetic-before-corruption").unwrap();
        fs::write(&path, b"broken json fixture").unwrap();
        let mut store = CredentialStore::open(path.clone());
        assert!(!store.is_configured());
        assert!(store.error().is_some());
        assert_eq!(fs::read(&path).unwrap(), b"broken json fixture");
        store.replace("synthetic-recovered").unwrap();
        assert!(store.error().is_none());
        assert!(CredentialStore::open(path.clone()).is_configured());
        clean(&path);
    }
    #[test]
    fn invalid_input_and_write_or_clear_failures_preserve_cached_value() {
        let path = path("failure");
        let mut store = CredentialStore::open(path.clone());
        store.replace("synthetic-preserved-value").unwrap();
        let previous = fs::read(&path).unwrap();
        assert!(store.replace("invalid internal whitespace").is_err());
        assert_eq!(fs::read(&path).unwrap(), previous);
        fs::remove_file(&path).unwrap();
        fs::create_dir(&path).unwrap();
        assert!(store.replace("synthetic-new-value").is_err());
        assert!(store.clear().is_err());
        assert_eq!(
            store.copy_for_request().unwrap().as_str(),
            "synthetic-preserved-value"
        );
        clean(&path);
    }
    #[cfg(unix)]
    #[test]
    fn new_file_is_owner_only_and_preexisting_temp_symlink_is_not_followed() {
        use std::os::unix::fs::{symlink, PermissionsExt};
        let path = path("permissions");
        let mut store = CredentialStore::open(path.clone());
        store.replace("synthetic-private-value").unwrap();
        assert_eq!(
            fs::metadata(&path).unwrap().permissions().mode() & 0o777,
            0o600
        );
        assert_eq!(
            fs::metadata(path.parent().unwrap())
                .unwrap()
                .permissions()
                .mode()
                & 0o777,
            0o700
        );
        let unrelated = path.parent().unwrap().join("unrelated.txt");
        fs::write(&unrelated, b"unchanged public fixture").unwrap();
        symlink(&unrelated, path.with_extension("tmp")).unwrap();
        store.replace("synthetic-replacement").unwrap();
        assert_eq!(fs::read(unrelated).unwrap(), b"unchanged public fixture");
        fs::set_permissions(&path, fs::Permissions::from_mode(0o644)).unwrap();
        let insecure = CredentialStore::open(path.clone());
        assert!(!insecure.is_configured());
        assert!(insecure.error().is_some());
        clean(&path);
    }
}
