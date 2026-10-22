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
    if raw.chars().count() > 8192 {
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
                && p.get("count").and_then(Value::as_u64) == Some(10)
                && p.get("need_content").and_then(Value::as_bool) == Some(false)
        }
        "fetch" => p.get("url").and_then(Value::as_str).is_some_and(valid_url),
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
    let mut caches = Vec::new();
    let mut total = 0;
    for (ri, r) in history.iter_mut().enumerate() {
        if let Some(hits) = r["hits"].as_array_mut() {
            for (hi, h) in hits.iter_mut().enumerate() {
                let size = h["content"].as_str().map_or(0, str::len);
                let fresh = h["fetchedAt"]
                    .as_u64()
                    .is_some_and(|n| time.saturating_sub(n) <= 86400000);
                if size > 0 && !fresh {
                    h.as_object_mut().unwrap().remove("content");
                    h["cacheCleared"] = Value::Bool(true);
                } else if size > 0 {
                    total += size;
                    caches.push((
                        h["lastUsedAt"]
                            .as_u64()
                            .or_else(|| h["fetchedAt"].as_u64())
                            .unwrap_or(0),
                        ri,
                        hi,
                        size,
                    ));
                }
            }
        }
    }
    caches.sort_by_key(|c| c.0);
    for (_, ri, hi, size) in caches {
        if total <= 50 * 1024 * 1024 {
            break;
        }
        let h = &mut history[ri]["hits"][hi];
        h.as_object_mut().unwrap().remove("content");
        h["cacheCleared"] = Value::Bool(true);
        total -= size;
    }
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
    fn history_retention_and_cache() {
        let mut h = vec![
            json!({"createdAt":now()-31*86400000,"hits":[]}),
            json!({"createdAt":now(),"hits":[{"fetchedAt":now()-2*86400000,"content":"body","preview":"preview"}]}),
        ];
        prune_history(&mut h);
        assert_eq!(h.len(), 1);
        assert!(h[0]["hits"][0]["content"].is_null());
        assert_eq!(h[0]["hits"][0]["preview"], "preview");
    }
    #[test]
    fn search_contract() {
        assert!(valid_payload(
            "search",
            &json!({"query":"技术 site:patents.google.com","ori_question":"技术","count":10,"need_content":false})
        ));
        assert!(!valid_payload(
            "search",
            &json!({"query":"a".repeat(129),"ori_question":"a","count":10,"need_content":false})
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
    fn fifty_mib_budget_evicts_least_recently_used_body_not_newest_task() {
        let time = now();
        let body = "x".repeat(20 * 1024 * 1024);
        let mut history = vec![
            json!({"createdAt":time,"hits":[{"content":body,"fetchedAt":time,"lastUsedAt":time-100,"preview":"p0"}]}),
            json!({"createdAt":time-1,"hits":[{"content":body,"fetchedAt":time,"lastUsedAt":time-1,"preview":"p1"}]}),
            json!({"createdAt":time-2,"hits":[{"content":body,"fetchedAt":time,"lastUsedAt":time-50,"preview":"p2"}]}),
        ];
        prune_history(&mut history);
        assert!(history[0]["hits"][0]["content"].is_null());
        assert_eq!(history[0]["hits"][0]["preview"], "p0");
        assert!(history[1]["hits"][0]["content"].is_string());
        assert!(history[2]["hits"][0]["content"].is_string());
        let size: usize = history
            .iter()
            .flat_map(|r| r["hits"].as_array().unwrap())
            .filter_map(|h| h["content"].as_str())
            .map(str::len)
            .sum();
        assert!(size <= 50 * 1024 * 1024);
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
