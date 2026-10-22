use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::time::{SystemTime, UNIX_EPOCH};
use url::Url;
pub const MAX_RESPONSE: usize = 5 * 1024 * 1024;
pub fn now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ApiError {
    pub kind: String,
    pub status: Option<u16>,
    pub retry_after: Option<u64>,
}
impl ApiError {
    pub fn new(kind: &str) -> Self {
        Self {
            kind: kind.into(),
            status: None,
            retry_after: None,
        }
    }
}
pub fn valid_key(input: &str) -> Result<String, String> {
    let key = input.trim();
    if key.is_empty() || key.chars().any(|c| c.is_whitespace() || c.is_control()) {
        return Err("请输入不含内部空白的 API Key".into());
    }
    Ok(key.into())
}
pub fn valid_url(raw: &str) -> bool {
    if raw.chars().count() > 8192 || raw.trim() != raw || raw.chars().any(char::is_control) {
        return false;
    }
    Url::parse(raw).is_ok_and(|u| {
        ["http", "https"].contains(&u.scheme())
            && u.host_str().is_some()
            && u.username().is_empty()
            && u.password().is_none()
    })
}
pub fn valid_payload(operation: &str, p: &Value) -> bool {
    match operation {
        "search" => {
            p.get("query")
                .and_then(Value::as_str)
                .is_some_and(|q| !q.trim().is_empty() && q.chars().count() <= 128)
                && p.get("ori_question")
                    .and_then(Value::as_str)
                    .is_some_and(|q| !q.trim().is_empty() && q.chars().count() <= 100)
                && p.get("count").and_then(Value::as_u64) == Some(50)
                && p.get("need_content").and_then(Value::as_bool) == Some(false)
        }
        _ => false,
    }
}
#[derive(Clone, Serialize, Deserialize, Debug)]
pub struct BalanceInfo {
    pub currency: String,
    pub total_balance: String,
    pub granted_balance: String,
    pub topped_up_balance: String,
}
#[derive(Clone, Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct BalanceSnapshot {
    pub credential_generation: u64,
    pub request_id: u64,
    pub fetched_at: u64,
    pub is_available: bool,
    pub infos: Vec<BalanceInfo>,
}
fn decimal(s: &str) -> bool {
    let s = s.strip_prefix('-').unwrap_or(s);
    let parts: Vec<_> = s.split('.').collect();
    !parts.is_empty()
        && parts.len() <= 2
        && parts
            .iter()
            .all(|s| !s.is_empty() && s.bytes().all(|c| c.is_ascii_digit()))
}
pub fn parse_balance(
    v: Value,
    generation: u64,
    request_id: u64,
) -> Result<BalanceSnapshot, ApiError> {
    let available = v
        .get("is_available")
        .and_then(Value::as_bool)
        .ok_or_else(|| ApiError::new("protocol"))?;
    let infos: Vec<BalanceInfo> = serde_json::from_value(
        v.get("balance_infos")
            .cloned()
            .ok_or_else(|| ApiError::new("protocol"))?,
    )
    .map_err(|_| ApiError::new("protocol"))?;
    if infos.is_empty()
        || infos.iter().any(|i| {
            !["CNY", "USD"].contains(&i.currency.as_str())
                || ![&i.total_balance, &i.granted_balance, &i.topped_up_balance]
                    .iter()
                    .all(|s| decimal(s))
        })
    {
        return Err(ApiError::new("protocol"));
    }
    let mut seen = std::collections::HashSet::new();
    if infos.iter().any(|i| !seen.insert(&i.currency)) {
        return Err(ApiError::new("protocol"));
    }
    Ok(BalanceSnapshot {
        credential_generation: generation,
        request_id,
        fetched_at: now(),
        is_available: available,
        infos,
    })
}
pub fn prune_history(history: &mut Vec<Value>) {
    let time = now();
    history.retain(|r| {
        r["createdAt"]
            .as_u64()
            .is_some_and(|n| time.saturating_sub(n) <= 30 * 86400000)
    });
    history.sort_by_key(|r| std::cmp::Reverse(r["createdAt"].as_u64().unwrap_or(0)));
    history.truncate(50);
    // Keep legacy stored body fields unchanged; the current UI receives a projection.
}
pub fn search_history_view(history: &[Value]) -> Vec<Value> {
    history
        .iter()
        .cloned()
        .map(|mut run| {
            let Some(object) = run.as_object_mut() else {
                return run;
            };
            object.remove("logicalFetch");
            if let Some(errors) = object.get_mut("errors").and_then(Value::as_array_mut) {
                errors.retain(|v| {
                    v.as_str().is_some_and(|s| {
                        !["正文", "抓取", "读取原文", "Fetch"]
                            .iter()
                            .any(|term| s.contains(term))
                    })
                });
            }
            if let Some(hits) = object.get_mut("hits").and_then(Value::as_array_mut) {
                for hit in hits {
                    if let Some(hit) = hit.as_object_mut() {
                        for field in [
                            "content",
                            "preview",
                            "fetchStatus",
                            "fetchedAt",
                            "truncated",
                            "cacheCleared",
                            "lastUsedAt",
                            "contentHash",
                            "error",
                        ] {
                            hit.remove(field);
                        }
                    }
                }
            }
            let old = run["status"].as_str().unwrap_or("");
            let has_hits = run["hits"].as_array().is_some_and(|h| !h.is_empty());
            let has_errors = run["errors"].as_array().is_some_and(|e| !e.is_empty());
            let pending =
                run["searchDone"].as_u64().unwrap_or(0) < run["searchTotal"].as_u64().unwrap_or(1);
            if matches!(old, "searching" | "reading") && pending {
                run["status"] = Value::String("stopped".into());
            } else if old == "reading" || (old == "partial" && !has_errors) {
                run["status"] = Value::String(
                    if has_errors {
                        if has_hits {
                            "partial"
                        } else {
                            "failed"
                        }
                    } else if has_hits {
                        "complete"
                    } else {
                        "empty"
                    }
                    .into(),
                );
            }
            run
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    #[test]
    fn key_rules() {
        assert_eq!(valid_key("  custom-key  ").unwrap(), "custom-key");
        for k in ["", "  ", "a\nb", "a b", "a\u{0000}b"] {
            assert!(valid_key(k).is_err());
        }
    }
    #[test]
    fn url_rules() {
        for u in [
            "file:///tmp/a",
            "javascript:alert(1)",
            "https://user:pass@example.com",
            "http://",
        ] {
            assert!(!valid_url(u));
        }
        assert!(valid_url("https://example.com/a?q=1#x"));
    }
    #[test]
    fn balance_precision_and_zero() {
        let v = json!({"is_available":false,"balance_infos":[{"currency":"CNY","total_balance":"0.000000000000001","granted_balance":"0.00","topped_up_balance":"0"}]});
        let b = parse_balance(v, 3, 1).unwrap();
        assert_eq!(b.infos[0].total_balance, "0.000000000000001");
        assert!(!b.is_available);
    }
    #[test]
    fn reject_bad_balance() {
        for infos in [
            json!([]),
            json!([{"currency":"EUR","total_balance":"1","granted_balance":"0","topped_up_balance":"1"}]),
            json!([{"currency":"CNY","total_balance":0,"granted_balance":"0","topped_up_balance":"1"}]),
            json!([{"currency":"USD","total_balance":"NaN","granted_balance":"0","topped_up_balance":"1"}]),
        ] {
            assert!(
                parse_balance(json!({"is_available":true,"balance_infos":infos}), 0, 1).is_err()
            );
        }
    }
    #[test]
    fn history_retention_preserves_legacy_fields() {
        let mut h = vec![
            json!({"createdAt":now()-31*86400000,"hits":[]}),
            json!({"createdAt":now(),"hits":[{"fetchedAt":now()-2*86400000,"content":"body","preview":"preview"}]}),
        ];
        prune_history(&mut h);
        assert_eq!(h.len(), 1);
        assert_eq!(h[0]["hits"][0]["content"], "body");
        assert_eq!(h[0]["hits"][0]["preview"], "preview");
    }
    #[test]
    fn search_contract() {
        assert!(valid_payload(
            "search",
            &json!({"query":"技术 site:patents.google.com","ori_question":"技术","count":50,"need_content":false})
        ));
        assert!(!valid_payload(
            "search",
            &json!({"query":"a".repeat(129),"ori_question":"a","count":50,"need_content":false})
        ));
    }
}

#[cfg(test)]
mod retention_and_balance_tests {
    use super::*;
    use serde_json::json;
    #[test]
    fn count_retention_keeps_newest_fifty_tasks() {
        let time = now();
        let mut history = (0..60)
            .map(|i| json!({"id":i,"createdAt":time-i*1000,"hits":[]}))
            .collect();
        prune_history(&mut history);
        assert_eq!(history.len(), 50);
        assert_eq!(history[0]["id"], 0);
        assert_eq!(history[49]["id"], 49);
    }
    #[test]
    fn legacy_body_is_hidden_in_view_without_mutating_stored_history() {
        let history = vec![
            json!({"createdAt":now(),"status":"reading","searchDone":2,"searchTotal":2,"logicalFetch":3,"errors":["正文不可用"],"hits":[{"originalUrl":"https://example.com/a?x=a%2Fb#part","title":"legacy title","snippet":"search summary","content":"legacy body","preview":"legacy preview","fetchStatus":"failed","error":"body error"}]}),
        ];
        let before = history.clone();
        let view = search_history_view(&history);
        assert_eq!(history, before);
        assert_eq!(view[0]["status"], "complete");
        assert!(view[0]["logicalFetch"].is_null());
        assert!(view[0]["hits"][0]["content"].is_null());
        assert!(view[0]["hits"][0]["error"].is_null());
        assert_eq!(view[0]["hits"][0]["snippet"], "search summary");
        assert_eq!(
            view[0]["hits"][0]["originalUrl"],
            "https://example.com/a?x=a%2Fb#part"
        );
    }
    #[test]
    fn removed_fetch_operation_is_rejected_before_network_or_credential_work() {
        assert!(!valid_payload(
            "fetch",
            &json!({"url":"https://example.com/a"})
        ));
        assert!(!valid_payload(
            "search",
            &json!({"query":"public","ori_question":"public","count":50,"need_content":true})
        ));
        for bad in [
            "javascript:alert(1)",
            "file:///tmp/a",
            "data:text/html,hello",
            "https://u:p@example.com",
            "\nhttps://example.com",
            "https://example.com/\nfoo",
        ] {
            assert!(!valid_url(bad));
        }
        assert!(valid_url("https://example.com/a?x=a%2Fb#part"));
    }
    #[test]
    fn multi_currency_exact_strings_are_preserved_and_duplicate_currency_is_rejected() {
        let cny = json!({"currency":"CNY","total_balance":"0.00","granted_balance":"0.00","topped_up_balance":"0.00"});
        let usd = json!({"currency":"USD","total_balance":"0.000000000000001","granted_balance":"0","topped_up_balance":"0.000000000000001"});
        let b = parse_balance(
            json!({"is_available":false,"balance_infos":[cny,usd]}),
            4,
            9,
        )
        .unwrap();
        assert_eq!(b.infos.len(), 2);
        assert_eq!(b.infos[0].total_balance, "0.00");
        assert_eq!(b.infos[1].total_balance, "0.000000000000001");
        assert!(!b.is_available);
        assert_eq!(b.request_id, 9);
        assert!(
            parse_balance(json!({"is_available":true,"balance_infos":[cny,cny]}), 0, 1).is_err()
        );
    }
}

pub fn panel_position(
    position: (i32, i32),
    area: (i32, i32, u32, u32),
    size: (u32, u32),
    margin: i32,
) -> (i32, i32) {
    let left = area.0.saturating_add(margin);
    let top = area.1.saturating_add(margin);
    let right = area
        .0
        .saturating_add(area.2 as i32)
        .saturating_sub(size.0 as i32)
        .saturating_sub(margin)
        .max(left);
    let bottom = area
        .1
        .saturating_add(area.3 as i32)
        .saturating_sub(size.1 as i32)
        .saturating_sub(margin)
        .max(top);
    (position.0.clamp(left, right), position.1.clamp(top, bottom))
}
#[cfg(test)]
mod panel_tests {
    use super::*;
    #[test]
    fn expanding_panel_stays_in_work_area_including_negative_and_scaled_monitors() {
        assert_eq!(
            panel_position((320, 320), (0, 0, 1440, 900), (720, 702), 12),
            (320, 186)
        );
        assert_eq!(
            panel_position((-100, 100), (-1920, 0, 1920, 1080), (720, 660), 12),
            (-732, 100)
        );
        assert_eq!(
            panel_position((600, 800), (0, 40, 2160, 1400), (1080, 1053), 18),
            (600, 369)
        );
        assert_eq!(
            panel_position((200, 100), (0, 0, 1440, 900), (720, 252), 12),
            (200, 100)
        );
    }
}
