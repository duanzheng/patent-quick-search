use tauri_plugin_global_shortcut::{Code, Modifiers, Shortcut};
pub fn validate(value: &str) -> Result<Shortcut, String> {
    let key: Shortcut = value
        .parse()
        .map_err(|_| "无法识别快捷键，请重新录制".to_string())?;
    if !key
        .mods
        .intersects(Modifiers::CONTROL | Modifiers::ALT | Modifiers::SUPER)
        || matches!(
            key.key,
            Code::Escape
                | Code::Tab
                | Code::ShiftLeft
                | Code::ShiftRight
                | Code::ControlLeft
                | Code::ControlRight
                | Code::AltLeft
                | Code::AltRight
                | Code::MetaLeft
                | Code::MetaRight
        )
    {
        return Err("请按下修饰键和另一个按键，Esc和Tab用于取消录制".into());
    }
    Ok(key)
}
pub trait Registry {
    fn register(&mut self, key: &str) -> Result<(), String>;
    fn unregister(&mut self, key: &str) -> Result<(), String>;
}
// Keep the old binding registered until both registration and persistence succeed.
// A rejected replacement therefore cannot silently disable the user's old shortcut.
pub fn replace<R: Registry>(
    registry: &mut R,
    old: &str,
    next: &str,
    old_registered: bool,
    mut persist: impl FnMut(bool) -> Result<(), String>,
) -> Result<(), String> {
    let same = validate(old).ok() == Some(validate(next)?);
    if same && old_registered {
        return persist(true);
    }
    registry
        .register(next)
        .map_err(|_| "这个快捷键不可用或已被占用，请录制其他组合".to_string())?;
    if let Err(error) = persist(true) {
        return match registry.unregister(next) {
            Ok(()) => Err(error),
            Err(_) => Err(format!("{error}；新快捷键未能撤销，请退出并重开应用")),
        };
    }
    if old_registered && !same && registry.unregister(old).is_err() {
        let rollback = persist(false);
        let cleanup = registry.unregister(next);
        return if rollback.is_err() || cleanup.is_err() {
            Err("快捷键切换未完成，请退出并重开应用后检查设置".into())
        } else {
            Err("未能切换快捷键，已保留原组合，请重试".into())
        };
    }
    Ok(())
}
#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashSet;
    #[derive(Default)]
    struct Fake {
        keys: HashSet<String>,
        fail_register: bool,
        fail_unregister_old: bool,
    }
    impl Registry for Fake {
        fn register(&mut self, key: &str) -> Result<(), String> {
            if self.fail_register {
                Err("occupied".into())
            } else {
                self.keys.insert(key.into());
                Ok(())
            }
        }
        fn unregister(&mut self, key: &str) -> Result<(), String> {
            if self.fail_unregister_old && key == "Alt+Super+Space" {
                Err("native failure".into())
            } else {
                self.keys.remove(key);
                Ok(())
            }
        }
    }
    const OLD: &str = "Alt+Super+Space";
    const NEW: &str = "Ctrl+Alt+KeyK";
    fn fake() -> Fake {
        Fake {
            keys: HashSet::from([OLD.into()]),
            ..Fake::default()
        }
    }
    #[test]
    fn validates_legacy_aliases_and_rejects_unmodified_and_modifier_only_input() {
        assert_eq!(
            validate(OLD).unwrap(),
            validate("Option+Command+Space").unwrap()
        );
        for v in [
            "A",
            "Shift+KeyA",
            "Super",
            "Alt+Super",
            "Ctrl+Escape",
            "Alt+Tab",
            "bad+wrong",
        ] {
            assert!(validate(v).is_err(), "{v}");
        }
    }
    #[test]
    fn registers_then_persists_then_retires_old_binding() {
        let mut r = fake();
        let mut stored = OLD.to_string();
        replace(&mut r, OLD, NEW, true, |next| {
            stored = if next { NEW } else { OLD }.into();
            Ok(())
        })
        .unwrap();
        assert_eq!(stored, NEW);
        assert_eq!(r.keys, HashSet::from([NEW.into()]));
    }
    #[test]
    fn conflict_leaves_old_registered_and_does_not_write_configuration() {
        let mut r = fake();
        r.fail_register = true;
        let mut writes = 0;
        assert!(replace(&mut r, OLD, NEW, true, |_| {
            writes += 1;
            Ok(())
        })
        .is_err());
        assert_eq!(writes, 0);
        assert!(r.keys.contains(OLD));
    }
    #[test]
    fn persistence_failure_never_unregisters_old_binding() {
        let mut r = fake();
        assert!(replace(&mut r, OLD, NEW, true, |_| Err("disk full".into())).is_err());
        assert_eq!(r.keys, HashSet::from([OLD.into()]));
    }
    #[test]
    fn failed_retirement_rolls_back_configuration_and_candidate() {
        let mut r = fake();
        r.fail_unregister_old = true;
        let mut stored = OLD.to_string();
        assert!(replace(&mut r, OLD, NEW, true, |next| {
            stored = if next { NEW } else { OLD }.into();
            Ok(())
        })
        .is_err());
        assert_eq!(stored, OLD);
        assert_eq!(r.keys, HashSet::from([OLD.into()]));
    }
    #[test]
    fn equivalent_legacy_spelling_does_not_register_twice() {
        let mut r = fake();
        r.fail_register = true;
        replace(&mut r, OLD, "Option+Command+Space", true, |_| Ok(())).unwrap();
        assert!(r.keys.contains(OLD));
    }
}
