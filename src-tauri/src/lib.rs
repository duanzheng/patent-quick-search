mod core;
mod storage;
use core::*;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::{
    collections::{HashMap, HashSet},
    fs,
    path::PathBuf,
    sync::{Arc, Mutex},
    time::Duration,
};
use tauri::{
    image::Image,
    menu::{Menu, MenuItem},
    tray::{TrayIconBuilder, TrayIconEvent},
    Emitter, Manager, State,
};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};
use tokio::sync::Semaphore;
use tokio_util::sync::CancellationToken;
use zeroize::Zeroizing;
const SERVICE: &str = "com.patentquicksearch.desktop";
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Settings {
    schema_version: u8,
    hotkey: String,
    history_enabled: bool,
    service_notice_accepted: bool,
}
impl Default for Settings {
    fn default() -> Self {
        Self {
            schema_version: 1,
            hotkey: if cfg!(target_os = "macos") {
                "Alt+Super+Space"
            } else {
                "Ctrl+Alt+Space"
            }
            .into(),
            history_enabled: true,
            service_notice_accepted: false,
        }
    }
}
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Disk {
    #[serde(default = "schema_one")]
    schema_version: u8,
    #[serde(default)]
    settings: Settings,
    #[serde(default)]
    history: Vec<Value>,
    #[serde(skip)]
    metrics: Vec<Value>,
}
fn schema_one() -> u8 {
    1
}
impl Default for Disk {
    fn default() -> Self {
        Self {
            schema_version: 1,
            settings: Settings::default(),
            history: Vec::new(),
            metrics: Vec::new(),
        }
    }
}
struct Guard {
    id: String,
    token: CancellationToken,
    deadline: u64,
    attempts: u8,
    searches: HashSet<String>,
    fetches: HashSet<String>,
}
struct Inner {
    disk: Disk,
    run: Option<Guard>,
    known: HashMap<String, u64>,
    generation: u64,
    balance: Option<BalanceSnapshot>,
    balance_token: CancellationToken,
    balance_loading: bool,
    balance_request_id: u64,
    cooldown: u64,
    hotkey_error: Option<String>,
    hidden_notice: bool,
}
struct AppState {
    inner: Mutex<Inner>,
    directory: PathBuf,
    client: reqwest::Client,
    slots: Arc<Semaphore>,
}
fn credential() -> Result<keyring::Entry, String> {
    keyring::Entry::new(SERVICE, "deepseek-api-key").map_err(|_| "无法访问系统凭据存储".into())
}
fn key() -> Result<Zeroizing<String>, ApiError> {
    credential()
        .map_err(|_| ApiError::new("credential"))?
        .get_password()
        .map(Zeroizing::new)
        .map_err(|_| ApiError::new("unconfigured"))
}
async fn load_key() -> Result<Zeroizing<String>, ApiError> {
    tauri::async_runtime::spawn_blocking(key)
        .await
        .map_err(|_| ApiError::new("credential"))?
}
fn configured() -> Result<bool, String> {
    match credential()?.get_password() {
        Ok(k) => {
            let _k = Zeroizing::new(k);
            Ok(true)
        }
        Err(keyring::Error::NoEntry) => Ok(false),
        Err(_) => Err("无法访问系统凭据存储，请检查 Keychain / Credential Manager".into()),
    }
}
fn save_disk(s: &AppState, d: &Disk) -> Result<(), String> {
    let bytes = serde_json::to_vec(d).map_err(|_| "无法编码本地数据")?;
    storage::atomic_write(&s.directory.join("state-v1.json"), &bytes)
        .map_err(|_| "无法保存本地数据".into())
}
fn append_metric(s: &AppState, d: &mut Disk, value: Value) -> Result<(), String> {
    use std::io::Write;
    fs::create_dir_all(&s.directory).map_err(|_| "无法创建指标目录")?;
    d.metrics.push(value.clone());
    let path = s.directory.join("metrics-v1.jsonl");
    let mut options = fs::OpenOptions::new();
    options.create(true).write(true).append(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    let mut file = options.open(&path).map_err(|_| "无法写入本地指标")?;
    serde_json::to_writer(&mut file, &value).map_err(|_| "无法编码本地指标")?;
    file.write_all(b"\n").map_err(|_| "无法保存本地指标")?;
    if d.metrics.len() > 10500 {
        let count = d.metrics.len() - 10000;
        d.metrics.drain(..count);
        drop(file);
        let mut file = fs::File::create(path).map_err(|_| "无法整理本地指标")?;
        for value in &d.metrics {
            serde_json::to_writer(&mut file, value).map_err(|_| "无法编码本地指标")?;
            file.write_all(b"\n").map_err(|_| "无法保存本地指标")?;
        }
    }
    Ok(())
}
fn cancel_inner(i: &mut Inner) {
    if let Some(g) = &i.run {
        g.token.cancel();
        let id = g.id.clone();
        for r in &mut i.disk.history {
            if r["id"] == id && matches!(r["status"].as_str(), Some("searching" | "reading")) {
                r["status"] = json!("stopped");
                r["cancelledAt"] = json!(now());
            }
        }
    }
}
fn reset_credential(i: &mut Inner) {
    cancel_inner(i);
    i.generation += 1;
    i.balance_token.cancel();
    i.balance_token = CancellationToken::new();
    i.balance_loading = false;
    i.balance = None;
    i.cooldown = 0;
}
#[tauri::command]
fn bootstrap(state: State<AppState>) -> Result<Value, String> {
    let mut i = state.inner.lock().unwrap();
    prune_history(&mut i.disk.history);
    let credential_status = match configured() {
        Ok(v) => (v, None),
        Err(e) => (false, Some(e)),
    };
    Ok(
        json!({"settings":i.disk.settings,"configured":credential_status.0,"credentialError":credential_status.1,"history":i.disk.history,"hotkeyError":i.hotkey_error}),
    )
}
#[tauri::command]
fn store_key(state: State<AppState>, input: String) -> Result<(), String> {
    let draft = Zeroizing::new(input);
    let checked = Zeroizing::new(valid_key(&draft)?);
    let mut i = state.inner.lock().unwrap();
    credential()?
        .set_password(&checked)
        .map_err(|_| "无法安全保存密钥，请重试")?;
    reset_credential(&mut i);
    let _ = save_disk(&state, &i.disk);
    Ok(())
}
#[tauri::command]
fn delete_key(state: State<AppState>) -> Result<(), String> {
    let mut i = state.inner.lock().unwrap();
    match credential()?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => (),
        Err(_) => return Err("无法删除系统凭据，请重试".into()),
    };
    reset_credential(&mut i);
    let _ = save_disk(&state, &i.disk);
    Ok(())
}
#[tauri::command]
fn update_settings(
    app: tauri::AppHandle,
    state: State<AppState>,
    settings: Settings,
) -> Result<(), String> {
    let mut i = state.inner.lock().unwrap();
    let old = i.disk.settings.clone();
    if settings.schema_version != 1 {
        return Err("不支持的设置版本".into());
    }
    let was_failed = i.hotkey_error.is_some();
    let register_needed = settings.hotkey != old.hotkey || was_failed;
    if register_needed {
        app.global_shortcut()
            .register(settings.hotkey.as_str())
            .map_err(|_| "无法注册快捷键，请检查系统设置或换一个组合")?;
        if settings.hotkey != old.hotkey {
            let _ = app.global_shortcut().unregister(old.hotkey.as_str());
        }
    }
    i.disk.settings = settings;
    if let Err(e) = save_disk(&state, &i.disk) {
        if register_needed {
            let _ = app
                .global_shortcut()
                .unregister(i.disk.settings.hotkey.as_str());
            if !was_failed {
                let _ = app.global_shortcut().register(old.hotkey.as_str());
            }
        }
        i.disk.settings = old;
        return Err(e);
    }
    i.hotkey_error = None;
    Ok(())
}
#[tauri::command]
fn begin_run(state: State<AppState>, id: String) -> Result<(), ApiError> {
    let mut i = state.inner.lock().unwrap();
    if !i.disk.settings.service_notice_accepted {
        return Err(ApiError::new("consent"));
    }
    cancel_inner(&mut i);
    i.known.insert(id.clone(), 0);
    i.run = Some(Guard {
        id,
        token: CancellationToken::new(),
        deadline: now() + 60000,
        attempts: 0,
        searches: HashSet::new(),
        fetches: HashSet::new(),
    });
    Ok(())
}
#[tauri::command]
fn cancel_run(state: State<AppState>, id: String) {
    let mut i = state.inner.lock().unwrap();
    if i.run.as_ref().is_some_and(|g| g.id == id) {
        cancel_inner(&mut i);
        let _ = save_disk(&state, &i.disk);
    }
}
async fn response(mut r: reqwest::Response) -> Result<Value, ApiError> {
    let status = r.status().as_u16();
    let retry = r
        .headers()
        .get("retry-after")
        .and_then(|v| v.to_str().ok())
        .and_then(|s| {
            s.parse::<u64>().ok().or_else(|| {
                httpdate::parse_http_date(s).ok().map(|t| {
                    t.duration_since(std::time::SystemTime::now())
                        .unwrap_or_default()
                        .as_secs()
                        + 1
                })
            })
        });
    if !(200..300).contains(&status) {
        return Err(ApiError {
            kind: "http".into(),
            status: Some(status),
            retry_after: retry,
        });
    }
    if r.content_length().is_some_and(|n| n > MAX_RESPONSE as u64) {
        return Err(ApiError::new("too_large"));
    }
    let mut bytes = Vec::new();
    while let Some(chunk) = r.chunk().await.map_err(|_| ApiError::new("network"))? {
        if bytes.len() + chunk.len() > MAX_RESPONSE {
            return Err(ApiError::new("too_large"));
        }
        bytes.extend_from_slice(&chunk);
    }
    serde_json::from_slice(&bytes).map_err(|_| ApiError::new("protocol"))
}
fn bearer(k: &str) -> Result<reqwest::header::HeaderValue, ApiError> {
    let mut v = reqwest::header::HeaderValue::from_str(&format!("Bearer {k}"))
        .map_err(|_| ApiError::new("credential"))?;
    v.set_sensitive(true);
    Ok(v)
}
#[tauri::command]
async fn api_request(
    state: State<'_, AppState>,
    id: String,
    operation: String,
    logical_id: String,
    attempt_index: u8,
    payload: Value,
) -> Result<Value, ApiError> {
    if attempt_index > 1 || logical_id.len() > 100 || !valid_payload(&operation, &payload) {
        return Err(ApiError::new("invalid_request"));
    }
    let (token, deadline) = {
        let mut i = state.inner.lock().unwrap();
        let g = i.run.as_mut().ok_or_else(|| ApiError::new("cancelled"))?;
        if g.id != id || g.token.is_cancelled() || now() >= g.deadline {
            return Err(ApiError::new("cancelled"));
        }
        let field = if operation == "search" {
            "query"
        } else {
            "url"
        };
        let item = payload[field].as_str().unwrap().to_string();
        let (set, limit) = if operation == "search" {
            (&mut g.searches, 2)
        } else {
            (&mut g.fetches, 5)
        };
        if !set.contains(&item) && set.len() >= limit {
            return Err(ApiError::new("budget"));
        }
        set.insert(item);
        if g.attempts >= 14 {
            return Err(ApiError::new("budget"));
        }
        g.attempts += 1;
        (g.token.clone(), g.deadline)
    };
    let started = now();
    let operation_future = async {
        let _permit = state
            .slots
            .acquire()
            .await
            .map_err(|_| ApiError::new("cancelled"))?;
        if token.is_cancelled() {
            return Err(ApiError::new("cancelled"));
        }
        let saved = load_key().await?;
        let endpoint = if operation == "search" {
            "https://api.deepseek.com/v1/tools/search"
        } else {
            "https://api.deepseek.com/v1/tools/fetch"
        };
        let result = response(
            state
                .client
                .post(endpoint)
                .header(reqwest::header::AUTHORIZATION, bearer(&saved)?)
                .json(&payload)
                .send()
                .await
                .map_err(|_| ApiError::new("network"))?,
        )
        .await;
        if result
            .as_ref()
            .err()
            .is_some_and(|e| matches!(e.status, Some(401 | 402)))
        {
            token.cancel();
        }
        result
    };
    let mut result = tokio::select! {biased; _=token.cancelled()=>Err(ApiError::new("cancelled")),r=tokio::time::timeout(Duration::from_millis(deadline.saturating_sub(now())),operation_future)=>r.unwrap_or_else(|_|Err(ApiError::new("cancelled")))};
    if operation == "fetch" {
        if let Ok(v) = &mut result {
            if let Some(content) = v["content"].as_str() {
                let hash = format!("{:x}", Sha256::digest(content.as_bytes()));
                v["content_hash"] = json!(hash);
            }
        }
    }
    {
        let mut i = state.inner.lock().unwrap();
        let e = result.as_ref().err();
        let metric = json!({"schemaVersion":1,"event":"request_attempt","runId":id,"operation":operation,"logicalRequestId":logical_id,"attemptIndex":attempt_index,"startedAt":started,"endedAt":now(),"status":if result.is_ok(){Some(200)}else{e.and_then(|e|e.status)},"errorKind":e.map(|e|&e.kind),"cancelled":e.is_some_and(|e|e.kind=="cancelled")});
        let _ = append_metric(&state, &mut i.disk, metric);
    }
    result
}
enum BalancePlan {
    Cached(BalanceSnapshot),
    Request {
        generation: u64,
        request_id: u64,
        token: CancellationToken,
    },
}
fn begin_balance(i: &mut Inner, refresh: bool) -> Result<BalancePlan, ApiError> {
    if i.balance_loading {
        return Err(ApiError::new("loading"));
    }
    if !refresh {
        if let Some(snapshot) = &i.balance {
            return Ok(BalancePlan::Cached(snapshot.clone()));
        }
    }
    if now() < i.cooldown {
        return Err(ApiError {
            kind: "http".into(),
            status: Some(429),
            retry_after: Some(i.cooldown.saturating_sub(now()).div_ceil(1000)),
        });
    }
    i.balance_loading = true;
    i.balance_request_id = i.balance_request_id.wrapping_add(1);
    Ok(BalancePlan::Request {
        generation: i.generation,
        request_id: i.balance_request_id,
        token: i.balance_token.clone(),
    })
}
fn complete_balance(
    i: &mut Inner,
    generation: u64,
    request_id: u64,
    token: &CancellationToken,
    result: Result<BalanceSnapshot, ApiError>,
) -> Result<BalanceSnapshot, ApiError> {
    if i.generation != generation || i.balance_request_id != request_id || token.is_cancelled() {
        return Err(ApiError::new("cancelled"));
    }
    i.balance_loading = false;
    match &result {
        Ok(snapshot) => i.balance = Some(snapshot.clone()),
        Err(error) => {
            if error.status == Some(401) {
                i.balance = None;
            }
            if error.status == Some(429) {
                i.cooldown =
                    now().saturating_add(error.retry_after.unwrap_or(30).saturating_mul(1000));
            }
        }
    }
    result
}
#[tauri::command]
async fn query_balance(
    state: State<'_, AppState>,
    refresh: bool,
) -> Result<BalanceSnapshot, ApiError> {
    let plan = begin_balance(&mut state.inner.lock().unwrap(), refresh)?;
    let (generation, request_id, token) = match plan {
        BalancePlan::Cached(snapshot) => return Ok(snapshot),
        BalancePlan::Request {
            generation,
            request_id,
            token,
        } => (generation, request_id, token),
    };
    let future = async {
        let saved = load_key().await?;
        let value = response(
            state
                .client
                .get("https://api.deepseek.com/user/balance")
                .header(reqwest::header::AUTHORIZATION, bearer(&saved)?)
                .timeout(Duration::from_secs(10))
                .send()
                .await
                .map_err(|_| ApiError::new("network"))?,
        )
        .await?;
        parse_balance(value, generation, request_id)
    };
    let result = tokio::select! {biased;_=token.cancelled()=>Err(ApiError::new("cancelled")),r=tokio::time::timeout(Duration::from_secs(10),future)=>r.unwrap_or_else(|_|Err(ApiError::new("network")))};
    complete_balance(
        &mut state.inner.lock().unwrap(),
        generation,
        request_id,
        &token,
        result,
    )
}
fn stage_run(i: &mut Inner, mut run: Value) -> Result<bool, String> {
    let id = run["id"].as_str().ok_or("无效任务")?.to_string();
    let revision = run["revision"].as_u64().ok_or("无效版本")?;
    if !i.disk.settings.history_enabled {
        return Ok(false);
    }
    let Some(prior) = i.known.get(&id) else {
        return Ok(false);
    };
    if revision <= *prior {
        return Ok(false);
    }
    if i.run
        .as_ref()
        .is_none_or(|guard| guard.id != id || guard.token.is_cancelled())
        && matches!(run["status"].as_str(), Some("searching" | "reading"))
    {
        run["status"] = json!("stopped");
    }
    i.known.insert(id.clone(), revision);
    i.disk.history.retain(|r| r["id"] != id);
    i.disk.history.insert(0, run);
    prune_history(&mut i.disk.history);
    Ok(true)
}
#[tauri::command]
async fn save_run(state: State<'_, AppState>, run: Value) -> Result<(), String> {
    let mut i = state.inner.lock().unwrap();
    if stage_run(&mut i, run)? {
        save_disk(&state, &i.disk)?;
    }
    Ok(())
}
#[tauri::command]
fn get_history(state: State<AppState>) -> Vec<Value> {
    let mut i = state.inner.lock().unwrap();
    prune_history(&mut i.disk.history);
    let _ = save_disk(&state, &i.disk);
    i.disk.history.clone()
}
#[tauri::command]
fn touch_cache(state: State<AppState>, run_id: String, result_id: String) {
    let mut i = state.inner.lock().unwrap();
    if let Some(r) = i.disk.history.iter_mut().find(|r| r["id"] == run_id) {
        if let Some(hits) = r["hits"].as_array_mut() {
            if let Some(h) = hits.iter_mut().find(|h| h["id"] == result_id) {
                h["lastUsedAt"] = json!(now());
            }
        }
    }
    let _ = save_disk(&state, &i.disk);
}
fn remove_history(i: &mut Inner, id: Option<String>) {
    if let Some(id) = id {
        if i.run.as_ref().is_some_and(|guard| guard.id == id) {
            cancel_inner(i);
        }
        i.known.remove(&id);
        i.disk.history.retain(|run| run["id"] != id);
    } else {
        cancel_inner(i);
        i.known.clear();
        i.disk.history.clear();
    }
}
#[tauri::command]
fn delete_history(state: State<AppState>, id: Option<String>) -> Result<(), String> {
    let mut i = state.inner.lock().unwrap();
    remove_history(&mut i, id);
    save_disk(&state, &i.disk)
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct MetricInput {
    event: String,
    result_id: Option<String>,
    run_id: String,
    attempts: u8,
    logical_search: u8,
    logical_fetch: u8,
    status: String,
    elapsed: u64,
}
#[tauri::command]
async fn record_metric(state: State<'_, AppState>, metric: MetricInput) -> Result<(), String> {
    let MetricInput {
        event,
        result_id,
        run_id,
        attempts,
        logical_search,
        logical_fetch,
        status,
        elapsed,
    } = metric;
    let allowed = [
        "run_started",
        "search_batch_received",
        "fetch_started",
        "fetch_completed",
        "result_opened",
        "source_opened",
        "source_copied",
        "query_edited",
        "run_cancelled",
        "run_finished",
    ];
    if !allowed.contains(&event.as_str())
        || !{
            let i = state.inner.lock().unwrap();
            i.known.contains_key(&run_id) || i.disk.history.iter().any(|r| r["id"] == run_id)
        }
    {
        return Ok(());
    }
    let mut i = state.inner.lock().unwrap();
    let metric = json!({"schemaVersion":1,"event":event,"resultId":result_id,"runId":run_id,"time":now(),"attempts":attempts,"logicalSearch":logical_search,"logicalFetch":logical_fetch,"status":status,"elapsed":elapsed});
    append_metric(&state, &mut i.disk, metric)
}
#[tauri::command]
async fn export_metrics(app: tauri::AppHandle, state: State<'_, AppState>) -> Result<bool, String> {
    let bytes = {
        let i = state.inner.lock().unwrap();
        let metrics: Vec<_> = i.disk.metrics.iter().rev().take(10000).rev().collect();
        serde_json::to_vec_pretty(&metrics).map_err(|_| "无法导出指标")?
    };
    tauri::async_runtime::spawn_blocking(move || {
        let Some(path) = app
            .dialog()
            .file()
            .set_file_name("技术点快搜-本地指标.json")
            .blocking_save_file()
        else {
            return Ok(false);
        };
        let path = path.into_path().map_err(|_| "无法访问导出位置")?;
        fs::write(path, bytes).map_err(|_| "无法写入导出文件".to_string())?;
        Ok(true)
    })
    .await
    .map_err(|_| "无法打开导出窗口".to_string())?
}
#[tauri::command]
async fn open_source(url: String) -> Result<(), String> {
    if !valid_url(&url) {
        return Err("仅允许打开合法的 HTTP/HTTPS 来源".into());
    }
    tauri::async_runtime::spawn_blocking(move || {
        #[cfg(target_os = "macos")]
        let mut cmd = std::process::Command::new("open");
        #[cfg(target_os = "windows")]
        let mut cmd = {
            let mut c = std::process::Command::new("rundll32.exe");
            c.arg("url.dll,FileProtocolHandler");
            c
        };
        #[cfg(not(any(target_os = "macos", target_os = "windows")))]
        let mut cmd = std::process::Command::new("xdg-open");
        #[cfg(target_os = "macos")]
        cmd.arg("--");
        cmd.arg(url)
            .status()
            .map_err(|_| "无法打开系统浏览器".to_string())
            .and_then(|s| {
                if s.success() {
                    Ok(())
                } else {
                    Err("无法打开系统浏览器".into())
                }
            })
    })
    .await
    .map_err(|_| "无法打开系统浏览器".to_string())?
}
fn show(app: &tauri::AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.show();
        let _ = w.unminimize();
        let _ = w.set_focus();
        let _ = w.emit("focus-input", ());
    }
}
fn hide(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let first = {
            let state = app.state::<AppState>();
            let mut i = state.inner.lock().unwrap();
            let first = !i.hidden_notice;
            i.hidden_notice = true;
            first
        };
        if first {
            app.dialog().message("窗口将收起，应用仍在菜单栏 / 系统托盘运行。通过菜单中的“打开技术点快搜”返回，通过“退出”结束应用；macOS 也可按 Command+Q 退出。")
                .title("如何返回和退出").show(move |_|{let _=window.hide();});
        } else {
            let _ = window.hide();
        }
    }
}
#[tauri::command]
fn hide_window(app: tauri::AppHandle) {
    hide(&app);
}
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, _, event| {
                    if event.state() == ShortcutState::Pressed {
                        if app.get_webview_window("main").is_some_and(|w| {
                            w.is_visible().unwrap_or(false) && w.is_focused().unwrap_or(false)
                        }) {
                            hide(app);
                        } else {
                            show(app);
                        }
                    }
                })
                .build(),
        )
        .setup(|app| {
            let directory = app.path().app_data_dir()?;
            let path = directory.join("state-v1.json");
            let mut disk = if path.exists() {
                serde_json::from_slice::<Disk>(&fs::read(&path)?)
                    .map_err(|_| std::io::Error::other("本地数据格式不兼容，未覆盖原文件"))?
            } else {
                Disk::default()
            };
            disk.metrics = fs::read_to_string(directory.join("metrics-v1.jsonl"))
                .unwrap_or_default()
                .lines()
                .filter_map(|line| serde_json::from_str(line).ok())
                .collect();
            if disk.schema_version != 1 {
                return Err(std::io::Error::other("不支持的本地数据版本，未覆盖原文件").into());
            }
            prune_history(&mut disk.history);
            for r in &mut disk.history {
                if matches!(r["status"].as_str(), Some("searching" | "reading")) {
                    r["status"] = json!("stopped");
                }
                if let Some(hits) = r["hits"].as_array_mut() {
                    for h in hits {
                        if matches!(h["fetchStatus"].as_str(), Some("queued" | "loading")) {
                            h["fetchStatus"] = json!("cancelled");
                        }
                    }
                }
            }
            let hotkey_error = app
                .global_shortcut()
                .register(disk.settings.hotkey.as_str())
                .err()
                .map(|_| "无法注册快捷键，请检查系统设置或换一个组合".into());
            let state = AppState {
                inner: Mutex::new(Inner {
                    disk,
                    run: None,
                    known: HashMap::new(),
                    generation: 0,
                    balance: None,
                    balance_token: CancellationToken::new(),
                    balance_loading: false,
                    balance_request_id: 0,
                    cooldown: 0,
                    hotkey_error,
                    hidden_notice: false,
                }),
                directory,
                client: reqwest::Client::builder()
                    .timeout(Duration::from_secs(15))
                    .redirect(reqwest::redirect::Policy::none())
                    .build()?,
                slots: Arc::new(Semaphore::new(2)),
            };
            save_disk(&state, &state.inner.lock().unwrap().disk).map_err(std::io::Error::other)?;
            app.manage(state);
            let menu = Menu::with_items(
                app,
                &[
                    &MenuItem::with_id(app, "show", "打开技术点快搜", true, None::<&str>)?,
                    &MenuItem::with_id(app, "hide", "收起窗口", true, None::<&str>)?,
                    &MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?,
                ],
            )?;
            let mut rgba = vec![0u8; 32 * 32 * 4];
            for y in 4..28 {
                for x in 4..28 {
                    let p = (y * 32 + x) * 4;
                    rgba[p] = 25;
                    rgba[p + 1] = 91;
                    rgba[p + 2] = 75;
                    rgba[p + 3] = 255;
                }
            }
            TrayIconBuilder::with_id("main-tray")
                .icon(Image::new_owned(rgba, 32, 32))
                .tooltip("技术点快搜")
                .menu(&menu)
                .on_menu_event(|app, e| match e.id.as_ref() {
                    "show" => show(app),
                    "hide" => hide(app),
                    "quit" => app.exit(0),
                    _ => (),
                })
                .on_tray_icon_event(|tray, e| {
                    if let TrayIconEvent::DoubleClick { .. } = e {
                        show(tray.app_handle());
                    }
                })
                .build(app)?;
            #[cfg(target_os = "macos")]
            app.set_menu(tauri::menu::Menu::default(app.handle())?)?;
            Ok(())
        })
        .on_window_event(|w, e| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = e {
                api.prevent_close();
                hide(w.app_handle());
            }
        })
        .invoke_handler(tauri::generate_handler![
            bootstrap,
            store_key,
            delete_key,
            update_settings,
            begin_run,
            cancel_run,
            api_request,
            query_balance,
            save_run,
            get_history,
            touch_cache,
            delete_history,
            record_metric,
            export_metrics,
            open_source,
            hide_window
        ])
        .build(tauri::generate_context!())
        .expect("无法启动技术点快搜");
    app.run(|app, event| {
        #[cfg(target_os = "macos")]
        if matches!(
            &event,
            tauri::RunEvent::Reopen {
                has_visible_windows: false,
                ..
            }
        ) {
            show(app);
        }
        if let tauri::RunEvent::Exit = event {
            let s = app.state::<AppState>();
            let mut i = s.inner.lock().unwrap();
            cancel_inner(&mut i);
            i.balance_token.cancel();
            i.balance = None;
            let _ = save_disk(&s, &i.disk);
        }
    });
}

#[cfg(test)]
mod transport_tests {
    use super::*;
    use std::io::{Read, Write};
    fn server(status: &str, headers: &str, body: Vec<u8>) -> String {
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let address = listener.local_addr().unwrap();
        let head = format!(
            "HTTP/1.1 {status}\r\nContent-Length: {}\r\nConnection: close\r\n{headers}\r\n",
            body.len()
        );
        std::thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            let mut request = [0u8; 4096];
            let _ = stream.read(&mut request);
            let _ = stream.write_all(head.as_bytes());
            let _ = stream.write_all(&body);
        });
        format!("http://{address}")
    }
    #[tokio::test]
    async fn raw_errors_are_redacted_and_retry_after_is_preserved() {
        let address = server(
            "429 Too Many Requests",
            "Retry-After: 42\r\n",
            b"server error might include user query or key".to_vec(),
        );
        let result = response(reqwest::get(address).await.unwrap())
            .await
            .unwrap_err();
        assert_eq!(result.status, Some(429));
        assert_eq!(result.retry_after, Some(42));
        assert!(!serde_json::to_string(&result)
            .unwrap()
            .contains("user query"));
    }
    #[tokio::test]
    async fn route_and_target_404_bodies_cannot_be_distinguished_from_redacted_errors() {
        let mut errors = Vec::new();
        for (headers, body) in [
            ("Content-Type: text/html\r\n", b"<html>synthetic route not found</html>".to_vec()),
            ("Content-Type: application/json\r\n", br#"{"error":{"type":"fixture_target_unavailable","message":"synthetic private URL must never escape"}}"#.to_vec()),
        ] {
            let address = server("404 Not Found", headers, body);
            let error = response(reqwest::get(address).await.unwrap()).await.unwrap_err();
            assert_eq!(error.status, Some(404));
            assert_eq!(error.kind, "http");
            errors.push(serde_json::to_string(&error).unwrap());
        }
        assert_eq!(errors[0], errors[1]);
        assert!(!errors[0].contains("synthetic"));
        assert!(!errors[0].contains("private"));
    }
    #[tokio::test]
    async fn oversized_response_is_rejected() {
        let address = server("200 OK", "", vec![b'a'; MAX_RESPONSE + 1]);
        let result = response(reqwest::get(address).await.unwrap())
            .await
            .unwrap_err();
        assert_eq!(result.kind, "too_large");
    }
    #[tokio::test]
    async fn malformed_json_is_protocol_failure() {
        let address = server("200 OK", "", b"not-json".to_vec());
        let result = response(reqwest::get(address).await.unwrap())
            .await
            .unwrap_err();
        assert_eq!(result.kind, "protocol");
    }
    #[test]
    fn persistence_excludes_in_memory_metrics_from_history_file() {
        let mut d = Disk::default();
        d.metrics.push(json!({"event":"source_opened"}));
        let value = serde_json::to_value(d).unwrap();
        assert!(value.get("metrics").is_none());
        assert_eq!(value["schemaVersion"], 1);
    }
}

#[cfg(test)]
mod state_tests {
    use super::*;
    fn inner() -> Inner {
        Inner {
            disk: Disk::default(),
            run: None,
            known: HashMap::new(),
            generation: 0,
            balance: None,
            balance_token: CancellationToken::new(),
            balance_loading: false,
            balance_request_id: 0,
            cooldown: 0,
            hotkey_error: None,
            hidden_notice: false,
        }
    }
    fn request(i: &mut Inner) -> (u64, u64, CancellationToken) {
        match begin_balance(i, true).unwrap() {
            BalancePlan::Request {
                generation,
                request_id,
                token,
            } => (generation, request_id, token),
            BalancePlan::Cached(_) => panic!("expected explicit request"),
        }
    }
    fn snapshot(generation: u64, request_id: u64) -> BalanceSnapshot {
        parse_balance(json!({"is_available":true,"balance_infos":[{"currency":"USD","total_balance":"1.000000000000001","granted_balance":"0","topped_up_balance":"1.000000000000001"}]}),generation,request_id).unwrap()
    }
    fn run(id: &str, revision: u64) -> Value {
        json!({"schemaVersion":1,"id":id,"revision":revision,"createdAt":now(),"status":"searching","query":"synthetic-public-query","hits":[{"content":"fixture body","preview":"fixture preview","fetchedAt":now(),"fetchStatus":"available"}]})
    }
    fn register(i: &mut Inner, id: &str) -> CancellationToken {
        let token = CancellationToken::new();
        i.known.insert(id.into(), 0);
        i.run = Some(Guard {
            id: id.into(),
            token: token.clone(),
            deadline: now() + 60000,
            attempts: 0,
            searches: HashSet::new(),
            fetches: HashSet::new(),
        });
        token
    }
    #[test]
    fn successful_balance_is_cached_but_refresh_starts_exactly_one_request() {
        let mut i = inner();
        let (g, r, t) = request(&mut i);
        assert!(begin_balance(&mut i, true).is_err());
        let b = snapshot(g, r);
        complete_balance(&mut i, g, r, &t, Ok(b)).unwrap();
        assert!(matches!(
            begin_balance(&mut i, false).unwrap(),
            BalancePlan::Cached(_)
        ));
        let (_, next, _) = request(&mut i);
        assert_ne!(next, r);
        assert!(begin_balance(&mut i, true).is_err());
    }
    #[test]
    fn credential_change_revokes_both_tokens_and_late_balance_cannot_clear_new_loading() {
        let mut i = inner();
        let run_token = register(&mut i, "old");
        stage_run(&mut i, run("old", 1)).unwrap();
        let (g, r, t) = request(&mut i);
        i.balance = Some(snapshot(g, r));
        i.cooldown = now() + 30000;
        reset_credential(&mut i);
        assert!(run_token.is_cancelled());
        assert!(t.is_cancelled());
        assert!(i.balance.is_none());
        assert_eq!(i.cooldown, 0);
        assert_eq!(i.disk.history.len(), 1);
        assert_eq!(i.disk.history[0]["status"], "stopped");
        let (new_g, new_r, new_t) = request(&mut i);
        assert!(complete_balance(&mut i, g, r, &t, Ok(snapshot(g, r))).is_err());
        assert!(i.balance_loading);
        assert!(i.balance.is_none());
        complete_balance(&mut i, new_g, new_r, &new_t, Ok(snapshot(new_g, new_r))).unwrap();
        assert_eq!(i.balance.as_ref().unwrap().credential_generation, new_g);
    }
    #[test]
    fn balance_request_id_rejects_outdated_response_in_same_generation() {
        let mut i = inner();
        let (g, r, t) = request(&mut i);
        assert!(complete_balance(&mut i, g, r + 1, &t, Ok(snapshot(g, r + 1))).is_err());
        assert!(i.balance_loading);
        assert!(i.balance.is_none());
    }
    #[test]
    fn balance_errors_preserve_stale_value_except_401_and_enforce_429_cooldown() {
        let mut i = inner();
        for status in [Some(500), None, Some(401), Some(429)] {
            let (g, r, t) = request(&mut i);
            i.balance = Some(snapshot(g, r));
            let start = now();
            let error = ApiError {
                kind: "http".into(),
                status,
                retry_after: None,
            };
            assert!(complete_balance(&mut i, g, r, &t, Err(error)).is_err());
            assert!(!i.balance_loading);
            if status == Some(401) {
                assert!(i.balance.is_none());
            } else {
                assert!(i.balance.is_some());
            }
            if status == Some(429) {
                assert!(i.cooldown >= start + 30000);
                assert!(begin_balance(&mut i, true).is_err());
            }
        }
    }
    #[test]
    fn history_off_revisions_and_deletion_prevent_late_persistence() {
        let mut i = inner();
        let token = register(&mut i, "r");
        assert!(stage_run(&mut i, run("r", 1)).unwrap());
        assert!(!stage_run(&mut i, run("r", 1)).unwrap());
        i.disk.settings.history_enabled = false;
        assert!(!stage_run(&mut i, run("r", 2)).unwrap());
        assert_eq!(i.disk.history.len(), 1);
        i.disk.settings.history_enabled = true;
        remove_history(&mut i, Some("r".into()));
        assert!(token.is_cancelled());
        assert!(i.disk.history.is_empty());
        assert!(!stage_run(&mut i, run("r", 3)).unwrap());
        assert!(i.disk.history.is_empty());
        register(&mut i, "next");
        stage_run(&mut i, run("next", 1)).unwrap();
        remove_history(&mut i, None);
        assert!(!stage_run(&mut i, run("next", 2)).unwrap());
        assert!(i.known.is_empty());
    }
    #[test]
    fn cancelled_backend_run_cannot_be_saved_as_running() {
        let mut i = inner();
        let token = register(&mut i, "r");
        token.cancel();
        stage_run(&mut i, run("r", 1)).unwrap();
        assert_eq!(i.disk.history[0]["status"], "stopped");
    }
    #[test]
    fn history_disk_roundtrip_excludes_balance_snapshot_and_metric_payloads() {
        let mut i = inner();
        register(&mut i, "r");
        stage_run(&mut i, run("r", 1)).unwrap();
        i.balance = Some(snapshot(0, 1));
        i.disk.metrics.push(json!({"event":"safe_fixture_event"}));
        let directory =
            std::env::temp_dir().join(format!("patent-disk-test-{}-{}", std::process::id(), now()));
        let state = AppState {
            inner: Mutex::new(i),
            directory: directory.clone(),
            client: reqwest::Client::new(),
            slots: Arc::new(Semaphore::new(2)),
        };
        save_disk(&state, &state.inner.lock().unwrap().disk).unwrap();
        let bytes = fs::read(directory.join("state-v1.json")).unwrap();
        let restored: Disk = serde_json::from_slice(&bytes).unwrap();
        assert_eq!(restored.history.len(), 1);
        let text = String::from_utf8(bytes).unwrap();
        assert!(!text.contains("total_balance"));
        assert!(!text.contains("safe_fixture_event"));
        assert!(!text.contains("1.000000000000001"));
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            assert_eq!(
                fs::metadata(directory.join("state-v1.json"))
                    .unwrap()
                    .permissions()
                    .mode()
                    & 0o777,
                0o600
            );
        }
        fs::remove_dir_all(directory).unwrap();
    }
}
