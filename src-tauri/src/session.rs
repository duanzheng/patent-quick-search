use crate::core::{valid_key, ApiError};
use zeroize::Zeroizing;

// Never serialized or exposed over IPC. No OS credential APIs or file fallback.
#[derive(Default)]
pub struct SessionCredential(Option<Zeroizing<String>>);
impl SessionCredential {
    pub fn is_configured(&self) -> bool {
        self.0.is_some()
    }
    pub fn replace(&mut self, input: &str) -> Result<(), String> {
        let checked = Zeroizing::new(valid_key(input)?);
        self.0 = Some(checked);
        Ok(())
    }
    pub fn copy_for_request(&self) -> Result<Zeroizing<String>, ApiError> {
        self.0
            .as_ref()
            .map(|value| Zeroizing::new(value.to_string()))
            .ok_or_else(|| ApiError::new("unconfigured"))
    }
    pub fn clear(&mut self) {
        self.0 = None;
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn fresh_process_starts_empty_and_requests_reuse_the_session() {
        let mut session = SessionCredential::default();
        assert!(!session.is_configured());
        assert_eq!(session.copy_for_request().unwrap_err().kind, "unconfigured");
        session.replace("  synthetic-session-value  ").unwrap();
        for _ in 0..4 {
            assert_eq!(
                session.copy_for_request().unwrap().as_str(),
                "synthetic-session-value"
            );
        }
        assert!(!SessionCredential::default().is_configured());
    }
    #[test]
    fn invalid_replacement_preserves_current_session() {
        let mut session = SessionCredential::default();
        session.replace("synthetic-previous-value").unwrap();
        assert!(session.replace("has internal whitespace").is_err());
        assert_eq!(
            session.copy_for_request().unwrap().as_str(),
            "synthetic-previous-value"
        );
    }
    #[test]
    fn clear_removes_only_the_current_memory_value() {
        let mut session = SessionCredential::default();
        session.replace("synthetic-current-value").unwrap();
        session.clear();
        assert!(!session.is_configured());
        assert_eq!(session.copy_for_request().unwrap_err().kind, "unconfigured");
    }
}
