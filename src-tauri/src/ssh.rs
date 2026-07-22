//! SSH 会话管理：交互式 PTY + 指标采集。
//! 远端输出通过 Tauri 事件 `pty://{session_id}` 推到前端。

use crate::credentials;
use crate::error::{AppError, AppResult};
use crate::hosts::{self, AuthType, HostRecord};
use async_trait::async_trait;
use russh::client::{self, Handle, Msg};
use russh::ChannelMsg;
use russh_keys::key::KeyPair;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::io::Write;
use std::path::Path;
use std::sync::Arc;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};
use tokio::sync::{mpsc, Mutex};
use uuid::Uuid;

struct ClientHandler;

#[async_trait]
impl client::Handler for ClientHandler {
    type Error = russh::Error;

    async fn check_server_key(
        &mut self,
        _server_public_key: &russh_keys::key::PublicKey,
    ) -> Result<bool, Self::Error> {
        // MVP：首次信任；后续可接 known_hosts
        Ok(true)
    }
}

/// 交互式终端滚动缓冲上限（字符），供 AI 上下文截取。
const MAX_PTY_BUFFER_CHARS: usize = 24_000;

struct LiveSession {
    handle: Handle<ClientHandler>,
    writer: mpsc::Sender<PtyCmd>,
    host_id: String,
    /// 与 PTY 读任务共享，记录最近终端输出。
    output_buf: Arc<Mutex<String>>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExecResult {
    pub stdout: String,
    pub stderr: String,
    pub exit_code: Option<u32>,
}

enum PtyCmd {
    Data(Vec<u8>),
    Resize { cols: u32, rows: u32 },
}

pub struct SessionManager {
    inner: Mutex<HashMap<String, LiveSession>>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionInfo {
    pub session_id: String,
    pub host_id: String,
    pub title: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub size: u64,
    pub file_type: String,
    pub modified: String,
    pub permissions: String,
    pub group: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteDirListing {
    pub path: String,
    pub entries: Vec<RemoteEntry>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteFileContent {
    pub path: String,
    pub name: String,
    pub size: u64,
    pub file_type: String,
    pub modified: String,
    pub permissions: String,
    pub group: String,
    pub truncated: bool,
    pub content: String,
    pub binary: bool,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProcessMetrics {
    pub name: String,
    pub memory_mi_b: f64,
    pub cpu_percent: f64,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HostMetrics {
    pub ip: String,
    pub os: String,
    pub kernel: String,
    pub arch: String,
    pub hostname: String,
    pub uptime_days: u64,
    pub uptime_text: String,
    pub load_avg: String,
    pub cpu_percent: f64,
    pub mem_used_gi_b: f64,
    pub mem_total_gi_b: f64,
    pub swap_used_mi_b: f64,
    pub swap_total_mi_b: f64,
    pub disk_used_gi_b: f64,
    pub disk_total_gi_b: f64,
    pub net_iface: String,
    pub net_rx_m_bs: f64,
    pub net_tx_k_bs: f64,
    pub net_rx_total_g_b: f64,
    pub net_tx_total_g_b: f64,
    pub top_processes: Vec<ProcessMetrics>,
}

impl SessionManager {
    pub fn new() -> Self {
        Self {
            inner: Mutex::new(HashMap::new()),
        }
    }

    pub async fn connect(&self, app: AppHandle, host_id: &str) -> AppResult<SessionInfo> {
        let host = hosts::get_host(host_id)?;
        let (handle, channel) = open_shell(&host, 120, 36).await?;
        let session_id = Uuid::new_v4().to_string();
        let (writer_tx, mut writer_rx) = mpsc::channel::<PtyCmd>(64);
        let event_name = format!("pty://{session_id}");
        let output_buf = Arc::new(Mutex::new(String::new()));

        // 读远端输出 → 前端 + ring buffer；同时消费本地写入与窗口大小变更
        let app_read = app.clone();
        let event_read = event_name.clone();
        let buf_read = output_buf.clone();
        tokio::spawn(async move {
            let mut channel = channel;
            loop {
                tokio::select! {
                    msg = channel.wait() => {
                        match msg {
                            Some(ChannelMsg::Data { ref data }) => {
                                let text = String::from_utf8_lossy(data).to_string();
                                append_pty_buffer(&buf_read, &text).await;
                                let _ = app_read.emit(&event_read, text);
                            }
                            Some(ChannelMsg::ExtendedData { ref data, .. }) => {
                                let text = String::from_utf8_lossy(data).to_string();
                                append_pty_buffer(&buf_read, &text).await;
                                let _ = app_read.emit(&event_read, text);
                            }
                            None => {
                                let _ = app_read.emit(&event_read, "\r\n[session closed]\r\n".to_string());
                                break;
                            }
                            _ => {}
                        }
                    }
                    cmd = writer_rx.recv() => {
                        match cmd {
                            Some(PtyCmd::Data(bytes)) => {
                                if channel.data(&bytes[..]).await.is_err() {
                                    break;
                                }
                            }
                            Some(PtyCmd::Resize { cols, rows }) => {
                                let _ = channel.window_change(cols, rows, 0, 0).await;
                            }
                            None => break,
                        }
                    }
                }
            }
        });

        let info = SessionInfo {
            session_id: session_id.clone(),
            host_id: host.id.clone(),
            title: host.name.clone(),
        };

        self.inner.lock().await.insert(
            session_id,
            LiveSession {
                handle,
                writer: writer_tx,
                host_id: host.id,
                output_buf,
            },
        );

        Ok(info)
    }

    pub async fn disconnect(&self, session_id: &str) -> AppResult<()> {
        let mut map = self.inner.lock().await;
        if let Some(session) = map.remove(session_id) {
            let _ = session
                .handle
                .disconnect(russh::Disconnect::ByApplication, "", "")
                .await;
        }
        Ok(())
    }

    pub async fn write(&self, session_id: &str, data: &str) -> AppResult<()> {
        let map = self.inner.lock().await;
        let session = map
            .get(session_id)
            .ok_or_else(|| AppError::Message("会话不存在".into()))?;
        session
            .writer
            .send(PtyCmd::Data(data.as_bytes().to_vec()))
            .await
            .map_err(|_| AppError::Message("写入会话失败".into()))?;
        Ok(())
    }

    pub async fn resize(&self, session_id: &str, cols: u32, rows: u32) -> AppResult<()> {
        let map = self.inner.lock().await;
        let session = map
            .get(session_id)
            .ok_or_else(|| AppError::Message("会话不存在".into()))?;
        session
            .writer
            .send(PtyCmd::Resize { cols, rows })
            .await
            .map_err(|_| AppError::Message("调整终端大小失败".into()))?;
        Ok(())
    }

    pub async fn metrics(&self, session_id: &str) -> AppResult<HostMetrics> {
        let host = self.host_for_session(session_id).await?;
        collect_metrics(&host).await
    }

    pub async fn list_dir(&self, session_id: &str, path: &str) -> AppResult<RemoteDirListing> {
        let host = self.host_for_session(session_id).await?;
        list_remote_dir(&host, path).await
    }

    pub async fn read_file(&self, session_id: &str, path: &str) -> AppResult<RemoteFileContent> {
        let host = self.host_for_session(session_id).await?;
        read_remote_file(&host, path).await
    }

    pub async fn mkdir(&self, session_id: &str, path: &str) -> AppResult<()> {
        let host = self.host_for_session(session_id).await?;
        remote_mkdir(&host, path).await
    }

    pub async fn create_file(&self, session_id: &str, path: &str) -> AppResult<()> {
        let host = self.host_for_session(session_id).await?;
        remote_create_file(&host, path).await
    }

    pub async fn rename_path(&self, session_id: &str, from: &str, to: &str) -> AppResult<()> {
        let host = self.host_for_session(session_id).await?;
        remote_rename(&host, from, to).await
    }

    pub async fn delete_path(&self, session_id: &str, path: &str) -> AppResult<()> {
        let host = self.host_for_session(session_id).await?;
        remote_delete(&host, path).await
    }

    pub async fn chmod_path(&self, session_id: &str, path: &str, mode: &str) -> AppResult<()> {
        let host = self.host_for_session(session_id).await?;
        remote_chmod(&host, path, mode).await
    }

    pub async fn download_path(
        &self,
        app: AppHandle,
        session_id: &str,
        remote_path: &str,
        local_path: &str,
        transfer_id: &str,
    ) -> AppResult<()> {
        let host = self.host_for_session(session_id).await?;
        remote_download(&host, remote_path, local_path, &app, transfer_id).await
    }

    pub async fn upload_file(
        &self,
        app: AppHandle,
        session_id: &str,
        local_path: &str,
        remote_path: &str,
        transfer_id: &str,
    ) -> AppResult<()> {
        let host = self.host_for_session(session_id).await?;
        remote_upload(&host, local_path, remote_path, &app, transfer_id).await
    }

    /// 返回会话最近终端输出尾部（已剥离部分 ANSI，供 AI 上下文）。
    pub async fn pty_output_tail(&self, session_id: &str, max_chars: usize) -> AppResult<String> {
        let map = self.inner.lock().await;
        let session = map
            .get(session_id)
            .ok_or_else(|| AppError::Message("会话不存在".into()))?;
        let buf = session.output_buf.lock().await;
        let raw = if buf.len() > max_chars {
            buf[buf.len() - max_chars..].to_string()
        } else {
            buf.clone()
        };
        Ok(strip_ansi_light(&raw))
    }

    /// 在已连接主机上开非交互 exec，捕获 stdout/stderr/exit（不写入交互式 shell stdin）。
    /// 使用与指标采集相同的独立 SSH 通道，避免占用交互式 shell。
    pub async fn exec_command(&self, session_id: &str, command: &str) -> AppResult<ExecResult> {
        let host = self.host_for_session(session_id).await?;
        run_exec_result(&host, command).await
    }

    /// 仅回显到前端终端（及 ring buffer），不写入远端 shell stdin，避免命令被执行两次。
    pub async fn mirror_display_output(
        &self,
        app: &AppHandle,
        session_id: &str,
        text: &str,
    ) -> AppResult<()> {
        {
            let map = self.inner.lock().await;
            let session = map
                .get(session_id)
                .ok_or_else(|| AppError::Message("会话不存在".into()))?;
            append_pty_buffer(&session.output_buf, text).await;
        }
        let _ = app.emit(&format!("pty://{session_id}"), text.to_string());
        Ok(())
    }

    pub async fn host_record_for_session(&self, session_id: &str) -> AppResult<HostRecord> {
        self.host_for_session(session_id).await
    }

    async fn host_for_session(&self, session_id: &str) -> AppResult<HostRecord> {
        let host_id = {
            let map = self.inner.lock().await;
            map.get(session_id)
                .map(|s| s.host_id.clone())
                .ok_or_else(|| AppError::Message("会话不存在".into()))?
        };
        hosts::get_host(&host_id)
    }
}

async fn append_pty_buffer(buf: &Arc<Mutex<String>>, text: &str) {
    let mut guard = buf.lock().await;
    guard.push_str(text);
    if guard.len() > MAX_PTY_BUFFER_CHARS {
        let drain = guard.len() - MAX_PTY_BUFFER_CHARS;
        guard.drain(..drain);
    }
}

/// 粗略去掉 CSI 序列，避免把颜色码塞进模型上下文。
fn strip_ansi_light(input: &str) -> String {
    let mut out = String::with_capacity(input.len());
    let mut chars = input.chars().peekable();
    while let Some(c) = chars.next() {
        if c == '\u{1b}' {
            if chars.peek() == Some(&'[') {
                chars.next();
                while let Some(n) = chars.next() {
                    if n.is_ascii_alphabetic() {
                        break;
                    }
                }
            }
            continue;
        }
        out.push(c);
    }
    out
}

async fn open_shell(
    host: &HostRecord,
    cols: u32,
    rows: u32,
) -> AppResult<(Handle<ClientHandler>, russh::Channel<Msg>)> {
    let config = Arc::new(client::Config::default());
    let mut handle =
        client::connect(config, (host.host.as_str(), host.port), ClientHandler).await?;

    let ok = match host.auth_type {
        AuthType::Password => {
            let password = credentials::get_secret(&host.id, "password")?.ok_or_else(|| {
                AppError::Message("未找到已保存的密码，请编辑连接并重新输入密码".into())
            })?;
            handle
                .authenticate_password(&host.username, password)
                .await?
        }
        AuthType::PrivateKey => {
            let path = host
                .private_key_path
                .as_ref()
                .ok_or_else(|| AppError::Message("未配置私钥路径".into()))?;
            let passphrase = credentials::get_secret(&host.id, "passphrase")?;
            let key = load_key(path, passphrase.as_deref())?;
            handle
                .authenticate_publickey(&host.username, Arc::new(key))
                .await?
        }
    };

    if !ok {
        return Err(AppError::Message("SSH 认证失败".into()));
    }

    let channel = handle.channel_open_session().await?;
    channel
        .request_pty(false, "xterm-256color", cols, rows, 0, 0, &[])
        .await?;
    channel.request_shell(true).await?;
    Ok((handle, channel))
}

fn load_key(path: &str, passphrase: Option<&str>) -> AppResult<KeyPair> {
    let path = Path::new(path);
    if !path.exists() {
        return Err(AppError::Message(format!("私钥文件不存在: {}", path.display())));
    }
    Ok(russh_keys::load_secret_key(path, passphrase)?)
}

/// 新增 / 编辑连接时的连通性探测（不落库、不创建交互会话）。
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionTestRequest {
    pub host: String,
    pub port: u16,
    pub username: String,
    pub auth_type: AuthType,
    pub password: Option<String>,
    pub private_key_path: Option<String>,
    pub passphrase: Option<String>,
    /// 编辑已有主机时：表单未填密码/口令则回退到钥匙串。
    pub host_id: Option<String>,
}

pub async fn test_connection(req: ConnectionTestRequest) -> AppResult<()> {
    let host = req.host.trim();
    let username = req.username.trim();
    if host.is_empty() {
        return Err(AppError::Message("请填写主机地址".into()));
    }
    if username.is_empty() {
        return Err(AppError::Message("请填写用户名".into()));
    }
    if req.port == 0 {
        return Err(AppError::Message("端口无效".into()));
    }

    let timeout = Duration::from_secs(12);
    tokio::time::timeout(timeout, test_connection_inner(req))
        .await
        .map_err(|_| AppError::Message("连接超时（12 秒内未完成认证）".into()))?
}

async fn test_connection_inner(req: ConnectionTestRequest) -> AppResult<()> {
    let config = Arc::new(client::Config::default());
    let mut handle = client::connect(
        config,
        (req.host.trim(), req.port),
        ClientHandler,
    )
    .await
    .map_err(|e| AppError::Message(format!("无法连接服务器: {e}")))?;

    let ok = match req.auth_type {
        AuthType::Password => {
            let password = match req.password.filter(|p| !p.is_empty()) {
                Some(p) => p,
                None => {
                    let host_id = req.host_id.as_deref().ok_or_else(|| {
                        AppError::Message("请输入密码后再测试连接".into())
                    })?;
                    credentials::get_secret(host_id, "password")?.ok_or_else(|| {
                        AppError::Message("未找到已保存的密码，请输入密码后再测试".into())
                    })?
                }
            };
            handle
                .authenticate_password(req.username.trim(), password)
                .await?
        }
        AuthType::PrivateKey => {
            let path = req
                .private_key_path
                .as_deref()
                .map(str::trim)
                .filter(|p| !p.is_empty())
                .ok_or_else(|| AppError::Message("请选择私钥文件".into()))?;
            let passphrase = match req.passphrase.filter(|p| !p.is_empty()) {
                Some(p) => Some(p),
                None => match req.host_id.as_deref() {
                    Some(host_id) => credentials::get_secret(host_id, "passphrase")?,
                    None => None,
                },
            };
            let key = load_key(path, passphrase.as_deref())?;
            handle
                .authenticate_publickey(req.username.trim(), Arc::new(key))
                .await?
        }
    };

    if !ok {
        return Err(AppError::Message("SSH 认证失败：用户名或凭证不正确".into()));
    }

    let _ = handle
        .disconnect(russh::Disconnect::ByApplication, "peekshell-test", "")
        .await;
    Ok(())
}

/// 用独立短连接执行只读探测，避免干扰交互式 PTY。
async fn collect_metrics(host: &HostRecord) -> AppResult<HostMetrics> {
    // 使用 KEY=VALUE 输出，避免把发行版版本号等误解析成内存字节数。
    let script = r#"
OS=$(cat /etc/os-release 2>/dev/null | grep -E '^NAME=' | head -1 | cut -d= -f2- | tr -d '"')
if [ -z "$OS" ]; then
  OS=$(cat /etc/os-release 2>/dev/null | grep -E '^PRETTY_NAME=' | head -1 | cut -d= -f2- | tr -d '"')
  # PRETTY_NAME 常带版本号，如 "Debian GNU/Linux 12 (bookworm)" → "Debian GNU/Linux"
  OS=$(printf '%s' "$OS" | sed -E 's/ [0-9].*$//; s/ \([^)]*\)$//')
fi
echo "HOSTNAME=$(hostname)"
echo "KERNEL=$(uname -r)"
echo "ARCH=$(uname -m)"
echo "OS=${OS:-Linux}"
echo "UPTIME=$(uptime)"
echo "LOAD=$(cut -d' ' -f1-3 /proc/loadavg 2>/dev/null)"
echo "MEM=$(free -b 2>/dev/null | awk '/^Mem:/{print $2,$3}')"
echo "SWAP=$(free -b 2>/dev/null | awk '/^Swap:/{print $2,$3}')"
echo "DISK=$(df -B1 / 2>/dev/null | awk 'NR==2{print $2,$3}')"
IFACE=$(ip -o -4 route show default 2>/dev/null | awk '{print $5; exit}')
if [ -z "$IFACE" ]; then IFACE=$(ls /sys/class/net 2>/dev/null | grep -v '^lo$' | head -1); fi
echo "IFACE=${IFACE:-}"
CPU1=$(awk '/^cpu /{print $2+$3+$4+$5+$6+$7+$8,$5}' /proc/stat 2>/dev/null)
RX1=0; TX1=0
if [ -n "$IFACE" ] && [ -r "/sys/class/net/$IFACE/statistics/rx_bytes" ]; then
  RX1=$(cat "/sys/class/net/$IFACE/statistics/rx_bytes")
  TX1=$(cat "/sys/class/net/$IFACE/statistics/tx_bytes")
fi
sleep 0.5
CPU2=$(awk '/^cpu /{print $2+$3+$4+$5+$6+$7+$8,$5}' /proc/stat 2>/dev/null)
RX2=$RX1; TX2=$TX1
if [ -n "$IFACE" ] && [ -r "/sys/class/net/$IFACE/statistics/rx_bytes" ]; then
  RX2=$(cat "/sys/class/net/$IFACE/statistics/rx_bytes")
  TX2=$(cat "/sys/class/net/$IFACE/statistics/tx_bytes")
fi
echo "CPU1=$CPU1"
echo "CPU2=$CPU2"
echo "NET=$RX1 $TX1 $RX2 $TX2"
LC_ALL=C ps -eo comm=,rss=,pcpu= --sort=-rss 2>/dev/null | head -n 5 | awk '{
  cpu=$NF; rss=$(NF-1); $NF=""; $(NF-1)="";
  sub(/^[[:space:]]+/, "", $0); sub(/[[:space:]]+$/, "", $0);
  printf "PROC\t%s\t%s\t%s\n", $0, rss, cpu
}'
"#;

    let output = run_exec(host, script).await.unwrap_or_default();
    Ok(parse_metrics(host, &output))
}

async fn run_exec(host: &HostRecord, command: &str) -> AppResult<String> {
    let result = run_exec_result(host, command).await?;
    Ok(result.stdout)
}

async fn run_exec_result(host: &HostRecord, command: &str) -> AppResult<ExecResult> {
    let config = Arc::new(client::Config::default());
    let mut handle =
        client::connect(config, (host.host.as_str(), host.port), ClientHandler).await?;

    let ok = match host.auth_type {
        AuthType::Password => {
            let password = credentials::get_secret(&host.id, "password")?.ok_or_else(|| {
                AppError::Message("未找到已保存的密码，请编辑连接并重新输入密码".into())
            })?;
            handle
                .authenticate_password(&host.username, password)
                .await?
        }
        AuthType::PrivateKey => {
            let path = host
                .private_key_path
                .as_ref()
                .ok_or_else(|| AppError::Message("未配置私钥路径".into()))?;
            let passphrase = credentials::get_secret(&host.id, "passphrase")?;
            let key = load_key(path, passphrase.as_deref())?;
            handle
                .authenticate_publickey(&host.username, Arc::new(key))
                .await?
        }
    };
    if !ok {
        return Err(AppError::Message("SSH 认证失败".into()));
    }

    let mut channel = handle.channel_open_session().await?;
    channel.exec(true, command).await?;
    let mut stdout = String::new();
    let mut stderr = String::new();
    let mut exit_code = None;
    while let Some(msg) = channel.wait().await {
        match msg {
            ChannelMsg::Data { ref data } => {
                stdout.push_str(&String::from_utf8_lossy(data));
            }
            ChannelMsg::ExtendedData { ref data, .. } => {
                stderr.push_str(&String::from_utf8_lossy(data));
            }
            ChannelMsg::ExitStatus { exit_status } => {
                exit_code = Some(exit_status);
            }
            _ => {}
        }
    }
    Ok(ExecResult {
        stdout,
        stderr,
        exit_code,
    })
}

async fn run_exec_bytes(host: &HostRecord, command: &str) -> AppResult<Vec<u8>> {
    let config = Arc::new(client::Config::default());
    let mut handle =
        client::connect(config, (host.host.as_str(), host.port), ClientHandler).await?;

    let ok = match host.auth_type {
        AuthType::Password => {
            let password = credentials::get_secret(&host.id, "password")?.ok_or_else(|| {
                AppError::Message("未找到已保存的密码，请编辑连接并重新输入密码".into())
            })?;
            handle
                .authenticate_password(&host.username, password)
                .await?
        }
        AuthType::PrivateKey => {
            let path = host
                .private_key_path
                .as_ref()
                .ok_or_else(|| AppError::Message("未配置私钥路径".into()))?;
            let passphrase = credentials::get_secret(&host.id, "passphrase")?;
            let key = load_key(path, passphrase.as_deref())?;
            handle
                .authenticate_publickey(&host.username, Arc::new(key))
                .await?
        }
    };
    if !ok {
        return Err(AppError::Message("SSH 认证失败".into()));
    }

    let mut channel = handle.channel_open_session().await?;
    channel.exec(true, command).await?;
    let mut buf = Vec::new();
    while let Some(msg) = channel.wait().await {
        if let ChannelMsg::Data { ref data } = msg {
            buf.extend_from_slice(data);
        }
    }
    Ok(buf)
}

fn shell_quote(value: &str) -> String {
    format!("'{}'", value.replace('\'', "'\\''"))
}

fn normalize_remote_path(path: &str) -> AppResult<String> {
    let trimmed = path.trim();
    if trimmed.is_empty() {
        return Ok("/".into());
    }
    if trimmed.contains('\0') || trimmed.contains('\n') || trimmed.contains('\r') {
        return Err(AppError::Message("路径无效".into()));
    }
    let mut parts: Vec<&str> = Vec::new();
    for part in trimmed.split('/') {
        if part.is_empty() || part == "." {
            continue;
        }
        if part == ".." {
            parts.pop();
            continue;
        }
        parts.push(part);
    }
    if parts.is_empty() {
        Ok("/".into())
    } else {
        Ok(format!("/{}", parts.join("/")))
    }
}

fn join_remote(dir: &str, name: &str) -> String {
    if dir == "/" {
        format!("/{name}")
    } else {
        format!("{dir}/{name}")
    }
}

async fn list_remote_dir(host: &HostRecord, path: &str) -> AppResult<RemoteDirListing> {
    let path = normalize_remote_path(path)?;
    let quoted = shell_quote(&path);
    let script = format!(
        r#"
path={quoted}
if [ ! -d "$path" ]; then
  echo "ERR|目录不存在或不可访问"
  exit 0
fi
echo "OK|$path"
# type|name|size|mtime|permissions|group
find "$path" -mindepth 1 -maxdepth 1 -printf '%y\t%f\t%s\t%TY-%Tm-%Td %TH:%TM\t%M\t%G\n' 2>/dev/null | LC_ALL=C sort
"#
    );
    let output = run_exec(host, &script).await?;
    let mut lines = output.lines().map(str::trim).filter(|l| !l.is_empty());
    let header = lines
        .next()
        .ok_or_else(|| AppError::Message("列出目录失败：无响应".into()))?;
    if let Some(msg) = header.strip_prefix("ERR|") {
        return Err(AppError::Message(msg.into()));
    }
    let resolved = header
        .strip_prefix("OK|")
        .unwrap_or(path.as_str())
        .to_string();

    let mut entries = Vec::new();
    for line in lines {
        let parts: Vec<&str> = line.splitn(6, '\t').collect();
        if parts.len() < 6 {
            continue;
        }
        let kind = parts[0];
        let name = parts[1];
        if name.is_empty() || name == "." || name == ".." {
            continue;
        }
        let is_dir = kind == "d";
        entries.push(RemoteEntry {
            name: name.to_string(),
            path: join_remote(&resolved, name),
            is_dir,
            size: parts[2].parse().unwrap_or(0),
            file_type: remote_file_type_label(kind),
            modified: parts[3].to_string(),
            permissions: parts[4].to_string(),
            group: parts[5].to_string(),
        });
    }
    entries.sort_by(|a, b| b.is_dir.cmp(&a.is_dir).then(a.name.cmp(&b.name)));
    Ok(RemoteDirListing {
        path: resolved,
        entries,
    })
}

fn remote_file_type_label(kind: &str) -> String {
    match kind {
        "d" => "directory".into(),
        "f" => "file".into(),
        "l" => "symlink".into(),
        "c" => "char".into(),
        "b" => "block".into(),
        "p" => "pipe".into(),
        "s" => "socket".into(),
        other => other.to_string(),
    }
}

const MAX_PREVIEW_BYTES: u64 = 512 * 1024;

async fn read_remote_file(host: &HostRecord, path: &str) -> AppResult<RemoteFileContent> {
    let path = normalize_remote_path(path)?;
    let quoted = shell_quote(&path);
    let max = MAX_PREVIEW_BYTES;
    let script = format!(
        r#"
path={quoted}
max={max}
if [ ! -e "$path" ]; then
  echo "ERR|文件不存在"
  exit 0
fi
if [ -d "$path" ]; then
  echo "ERR|路径是目录"
  exit 0
fi
# name|size|type|mtime|permissions|group
meta=$(stat -c $'%n\t%s\t%F\t%y\t%A\t%G' "$path" 2>/dev/null)
echo "META|$meta"
head -c "$max" "$path"
"#
    );
    let output = run_exec_bytes(host, &script).await?;
    let Some(nl) = output.iter().position(|b| *b == b'\n') else {
        let text = String::from_utf8_lossy(&output);
        if let Some(msg) = text.trim().strip_prefix("ERR|") {
            return Err(AppError::Message(msg.into()));
        }
        return Err(AppError::Message("读取文件失败：无响应".into()));
    };
    let header = String::from_utf8_lossy(&output[..nl]);
    let body = &output[nl + 1..];
    let header = header.trim();
    if let Some(msg) = header.strip_prefix("ERR|") {
        return Err(AppError::Message(msg.into()));
    }
    let meta = header
        .strip_prefix("META|")
        .ok_or_else(|| AppError::Message("读取文件失败：响应格式错误".into()))?;
    let parts: Vec<&str> = meta.splitn(6, '\t').collect();
    let resolved = parts.first().copied().unwrap_or(path.as_str()).to_string();
    let name = resolved
        .rsplit('/')
        .next()
        .filter(|s| !s.is_empty())
        .unwrap_or(resolved.as_str())
        .to_string();
    let size: u64 = parts.get(1).and_then(|s| s.parse().ok()).unwrap_or(0);
    let file_type = parts
        .get(2)
        .map(|s| s.to_string())
        .unwrap_or_else(|| "file".into());
    let modified = parts
        .get(3)
        .map(|s| s.chars().take(16).collect::<String>())
        .unwrap_or_default();
    let permissions = parts.get(4).unwrap_or(&"").to_string();
    let group = parts.get(5).unwrap_or(&"").to_string();
    let binary = body.contains(&0);
    let truncated = size > MAX_PREVIEW_BYTES;
    let content = if binary {
        String::new()
    } else {
        String::from_utf8_lossy(body).into_owned()
    };
    Ok(RemoteFileContent {
        path: resolved,
        name,
        size,
        file_type,
        modified,
        permissions,
        group,
        truncated,
        content,
        binary,
    })
}

fn parent_remote(path: &str) -> String {
    if path == "/" {
        return "/".into();
    }
    match path.rfind('/') {
        Some(0) | None => "/".into(),
        Some(i) => path[..i].to_string(),
    }
}

fn basename_remote(path: &str) -> String {
    if path == "/" {
        return "/".into();
    }
    path.rsplit('/')
        .next()
        .filter(|s| !s.is_empty())
        .unwrap_or(path)
        .to_string()
}

fn assert_ok_output(output: &str, fallback: &str) -> AppResult<()> {
    let line = output
        .lines()
        .map(str::trim)
        .find(|l| !l.is_empty())
        .unwrap_or("");
    if line == "OK" || line.starts_with("OK|") {
        return Ok(());
    }
    if let Some(msg) = line.strip_prefix("ERR|") {
        return Err(AppError::Message(msg.into()));
    }
    if line.is_empty() {
        return Err(AppError::Message(fallback.into()));
    }
    Err(AppError::Message(format!("{fallback}: {line}")))
}

fn validate_chmod_mode(mode: &str) -> AppResult<&str> {
    let mode = mode.trim();
    if mode.is_empty() || mode.len() > 32 {
        return Err(AppError::Message("权限模式无效".into()));
    }
    let ok = mode.chars().all(|c| {
        c.is_ascii_digit()
            || matches!(
                c,
                'u' | 'g' | 'o' | 'a' | 'r' | 'w' | 'x' | 'X' | 's' | 't' | '+' | '-' | '=' | ','
            )
    });
    if !ok {
        return Err(AppError::Message("权限模式无效".into()));
    }
    Ok(mode)
}

async fn remote_mkdir(host: &HostRecord, path: &str) -> AppResult<()> {
    let path = normalize_remote_path(path)?;
    if path == "/" {
        return Err(AppError::Message("不能创建根目录".into()));
    }
    let quoted = shell_quote(&path);
    let script = format!(
        r#"
path={quoted}
if mkdir -p -- "$path"; then echo OK; else echo ERR|创建目录失败; fi
"#
    );
    assert_ok_output(&run_exec(host, &script).await?, "创建目录失败")
}

async fn remote_create_file(host: &HostRecord, path: &str) -> AppResult<()> {
    let path = normalize_remote_path(path)?;
    if path == "/" {
        return Err(AppError::Message("路径无效".into()));
    }
    let quoted = shell_quote(&path);
    let script = format!(
        r#"
path={quoted}
if [ -e "$path" ]; then
  echo ERR|文件已存在
  exit 0
fi
parent=$(dirname -- "$path")
mkdir -p -- "$parent" || {{ echo ERR|创建父目录失败; exit 0; }}
if : > "$path"; then echo OK; else echo ERR|创建文件失败; fi
"#
    );
    assert_ok_output(&run_exec(host, &script).await?, "创建文件失败")
}

async fn remote_rename(host: &HostRecord, from: &str, to: &str) -> AppResult<()> {
    let from = normalize_remote_path(from)?;
    let to = normalize_remote_path(to)?;
    if from == "/" || to == "/" {
        return Err(AppError::Message("不能重命名根目录".into()));
    }
    if from == to {
        return Ok(());
    }
    let from_q = shell_quote(&from);
    let to_q = shell_quote(&to);
    let script = format!(
        r#"
from={from_q}
to={to_q}
if [ ! -e "$from" ]; then echo ERR|源路径不存在; exit 0; fi
if [ -e "$to" ]; then echo ERR|目标已存在; exit 0; fi
parent=$(dirname -- "$to")
mkdir -p -- "$parent" || {{ echo ERR|创建目标目录失败; exit 0; }}
if mv -- "$from" "$to"; then echo OK; else echo ERR|重命名失败; fi
"#
    );
    assert_ok_output(&run_exec(host, &script).await?, "重命名失败")
}

async fn remote_delete(host: &HostRecord, path: &str) -> AppResult<()> {
    let path = normalize_remote_path(path)?;
    if path == "/" {
        return Err(AppError::Message("不能删除根目录".into()));
    }
    let quoted = shell_quote(&path);
    let script = format!(
        r#"
path={quoted}
if [ ! -e "$path" ]; then echo ERR|路径不存在; exit 0; fi
if rm -rf -- "$path"; then echo OK; else echo ERR|删除失败; fi
"#
    );
    assert_ok_output(&run_exec(host, &script).await?, "删除失败")
}

async fn remote_chmod(host: &HostRecord, path: &str, mode: &str) -> AppResult<()> {
    let path = normalize_remote_path(path)?;
    let mode = validate_chmod_mode(mode)?;
    let path_q = shell_quote(&path);
    let mode_q = shell_quote(mode);
    let script = format!(
        r#"
path={path_q}
mode={mode_q}
if [ ! -e "$path" ]; then echo ERR|路径不存在; exit 0; fi
if chmod -- "$mode" "$path"; then echo OK; else echo ERR|修改权限失败; fi
"#
    );
    assert_ok_output(&run_exec(host, &script).await?, "修改权限失败")
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct TransferProgressPayload {
    id: String,
    transferred: u64,
    total: u64,
    status: &'static str,
    error: Option<String>,
}

fn emit_transfer_progress(app: &AppHandle, payload: TransferProgressPayload) {
    let _ = app.emit("transfer://progress", payload);
}

async fn remote_download(
    host: &HostRecord,
    remote_path: &str,
    local_path: &str,
    app: &AppHandle,
    transfer_id: &str,
) -> AppResult<()> {
    let remote_path = normalize_remote_path(remote_path)?;
    if local_path.trim().is_empty() {
        return Err(AppError::Message("本地路径无效".into()));
    }
    let quoted = shell_quote(&remote_path);
    let probe = format!(
        r#"
path={quoted}
if [ ! -e "$path" ]; then echo ERR|路径不存在; exit 0; fi
if [ -d "$path" ]; then echo DIR; else echo FILE; fi
"#
    );
    let kind = run_exec(host, &probe).await?;
    let kind = kind.lines().map(str::trim).find(|l| !l.is_empty()).unwrap_or("");
    if let Some(msg) = kind.strip_prefix("ERR|") {
        emit_transfer_progress(
            app,
            TransferProgressPayload {
                id: transfer_id.to_string(),
                transferred: 0,
                total: 0,
                status: "error",
                error: Some(msg.to_string()),
            },
        );
        return Err(AppError::Message(msg.into()));
    }

    let (cmd, total) = if kind == "DIR" {
        let parent = parent_remote(&remote_path);
        let name = basename_remote(&remote_path);
        let parent_q = shell_quote(&parent);
        let name_q = shell_quote(&name);
        (format!("tar czf - -C {parent_q} {name_q}"), 0u64)
    } else if kind == "FILE" {
        let size_raw = run_exec(host, &format!("stat -c%s -- {quoted} 2>/dev/null || wc -c < {quoted}")).await?;
        let total = size_raw
            .lines()
            .map(str::trim)
            .find(|l| !l.is_empty())
            .and_then(|l| l.parse::<u64>().ok())
            .unwrap_or(0);
        (format!("cat -- {quoted}"), total)
    } else {
        return Err(AppError::Message("下载失败：无法识别路径类型".into()));
    };

    if let Some(parent) = Path::new(local_path).parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| AppError::Message(format!("创建本地目录失败: {e}")))?;
    }

    emit_transfer_progress(
        app,
        TransferProgressPayload {
            id: transfer_id.to_string(),
            transferred: 0,
            total,
            status: "running",
            error: None,
        },
    );

    match run_exec_to_file(host, &cmd, local_path, app, transfer_id, total).await {
        Ok(transferred) => {
            emit_transfer_progress(
                app,
                TransferProgressPayload {
                    id: transfer_id.to_string(),
                    transferred,
                    total: if total > 0 { total } else { transferred },
                    status: "done",
                    error: None,
                },
            );
            Ok(())
        }
        Err(e) => {
            emit_transfer_progress(
                app,
                TransferProgressPayload {
                    id: transfer_id.to_string(),
                    transferred: 0,
                    total,
                    status: "error",
                    error: Some(e.to_string()),
                },
            );
            Err(e)
        }
    }
}

async fn run_exec_to_file(
    host: &HostRecord,
    command: &str,
    local_path: &str,
    app: &AppHandle,
    transfer_id: &str,
    total: u64,
) -> AppResult<u64> {
    let handle = open_authenticated_handle(host).await?;
    let mut channel = handle.channel_open_session().await?;
    channel.exec(true, command).await?;

    let mut file = std::fs::File::create(local_path)
        .map_err(|e| AppError::Message(format!("写入本地文件失败: {e}")))?;
    let mut transferred = 0u64;
    let mut last_emit = Instant::now() - Duration::from_millis(200);

    while let Some(msg) = channel.wait().await {
        if let ChannelMsg::Data { ref data } = msg {
            file.write_all(data)
                .map_err(|e| AppError::Message(format!("写入本地文件失败: {e}")))?;
            transferred += data.len() as u64;
            if last_emit.elapsed() >= Duration::from_millis(120) {
                emit_transfer_progress(
                    app,
                    TransferProgressPayload {
                        id: transfer_id.to_string(),
                        transferred,
                        total,
                        status: "running",
                        error: None,
                    },
                );
                last_emit = Instant::now();
            }
        }
    }

    let _ = handle
        .disconnect(russh::Disconnect::ByApplication, "", "")
        .await;
    Ok(transferred)
}

async fn open_authenticated_handle(host: &HostRecord) -> AppResult<Handle<ClientHandler>> {
    let config = Arc::new(client::Config::default());
    let mut handle =
        client::connect(config, (host.host.as_str(), host.port), ClientHandler).await?;

    let ok = match host.auth_type {
        AuthType::Password => {
            let password = credentials::get_secret(&host.id, "password")?.ok_or_else(|| {
                AppError::Message("未找到已保存的密码，请编辑连接并重新输入密码".into())
            })?;
            handle
                .authenticate_password(&host.username, password)
                .await?
        }
        AuthType::PrivateKey => {
            let path = host
                .private_key_path
                .as_ref()
                .ok_or_else(|| AppError::Message("未配置私钥路径".into()))?;
            let passphrase = credentials::get_secret(&host.id, "passphrase")?;
            let key = load_key(path, passphrase.as_deref())?;
            handle
                .authenticate_publickey(&host.username, Arc::new(key))
                .await?
        }
    };
    if !ok {
        return Err(AppError::Message("SSH 认证失败".into()));
    }
    Ok(handle)
}

async fn remote_upload(
    host: &HostRecord,
    local_path: &str,
    remote_path: &str,
    app: &AppHandle,
    transfer_id: &str,
) -> AppResult<()> {
    let remote_path = normalize_remote_path(remote_path)?;
    if remote_path == "/" {
        return Err(AppError::Message("远端路径无效".into()));
    }
    let meta = std::fs::metadata(local_path)
        .map_err(|e| AppError::Message(format!("读取本地文件失败: {e}")))?;
    let total = meta.len();
    let data = std::fs::read(local_path)
        .map_err(|e| AppError::Message(format!("读取本地文件失败: {e}")))?;

    let parent = parent_remote(&remote_path);
    let parent_q = shell_quote(&parent);
    let ensure = format!(
        r#"
parent={parent_q}
mkdir -p -- "$parent" && echo OK || echo ERR|创建远端目录失败
"#
    );
    assert_ok_output(&run_exec(host, &ensure).await?, "创建远端目录失败")?;

    emit_transfer_progress(
        app,
        TransferProgressPayload {
            id: transfer_id.to_string(),
            transferred: 0,
            total,
            status: "running",
            error: None,
        },
    );

    let result = async {
        let handle = open_authenticated_handle(host).await?;
        let mut channel = handle.channel_open_session().await?;
        let cmd = format!("cat > {}", shell_quote(&remote_path));
        channel.exec(true, cmd.as_str()).await?;

        const CHUNK: usize = 32 * 1024;
        let mut transferred = 0u64;
        let mut last_emit = Instant::now() - Duration::from_millis(200);
        for chunk in data.chunks(CHUNK) {
            channel
                .data(chunk)
                .await
                .map_err(|e| AppError::Message(format!("上传失败: {e}")))?;
            transferred += chunk.len() as u64;
            if last_emit.elapsed() >= Duration::from_millis(120) {
                emit_transfer_progress(
                    app,
                    TransferProgressPayload {
                        id: transfer_id.to_string(),
                        transferred,
                        total,
                        status: "running",
                        error: None,
                    },
                );
                last_emit = Instant::now();
            }
        }
        channel
            .eof()
            .await
            .map_err(|e| AppError::Message(format!("上传结束失败: {e}")))?;

        let mut stderr = String::new();
        let mut code: Option<u32> = None;
        while let Some(msg) = channel.wait().await {
            match msg {
                ChannelMsg::ExtendedData { ref data, .. } => {
                    stderr.push_str(&String::from_utf8_lossy(data));
                }
                ChannelMsg::ExitStatus { exit_status } => {
                    code = Some(exit_status);
                }
                _ => {}
            }
        }

        let _ = handle
            .disconnect(russh::Disconnect::ByApplication, "", "")
            .await;

        if code.unwrap_or(1) != 0 {
            let msg = stderr.trim();
            if msg.is_empty() {
                return Err(AppError::Message("上传失败".into()));
            }
            return Err(AppError::Message(format!("上传失败: {msg}")));
        }
        Ok(transferred)
    }
    .await;

    match result {
        Ok(transferred) => {
            emit_transfer_progress(
                app,
                TransferProgressPayload {
                    id: transfer_id.to_string(),
                    transferred,
                    total,
                    status: "done",
                    error: None,
                },
            );
            Ok(())
        }
        Err(e) => {
            emit_transfer_progress(
                app,
                TransferProgressPayload {
                    id: transfer_id.to_string(),
                    transferred: 0,
                    total,
                    status: "error",
                    error: Some(e.to_string()),
                },
            );
            Err(e)
        }
    }
}

fn parse_metrics(host: &HostRecord, raw: &str) -> HostMetrics {
    let mut fields = std::collections::HashMap::new();
    let mut top_processes = Vec::new();
    for line in raw.lines() {
        if let Some(process) = line.strip_prefix("PROC\t") {
            let mut parts = process.splitn(3, '\t');
            let name = parts.next().unwrap_or("").trim();
            let memory_kib = parts
                .next()
                .and_then(|value| value.parse::<f64>().ok())
                .unwrap_or(0.0);
            let cpu_percent = parts
                .next()
                .and_then(|value| value.parse::<f64>().ok())
                .unwrap_or(0.0);
            if !name.is_empty() {
                top_processes.push(ProcessMetrics {
                    name: name.to_string(),
                    memory_mi_b: memory_kib / 1024.0,
                    cpu_percent,
                });
            }
        } else if let Some((key, value)) = line.split_once('=') {
            fields.insert(key.trim().to_string(), value.trim().to_string());
        }
    }

    let get = |key: &str| fields.get(key).map(String::as_str).unwrap_or("");
    let pair = |key: &str| -> (u64, u64) {
        let mut parts = get(key).split_whitespace().filter_map(|t| t.parse::<u64>().ok());
        (parts.next().unwrap_or(0), parts.next().unwrap_or(0))
    };

    let uptime_text = get("UPTIME").to_string();
    let (mem_total, mem_used) = pair("MEM");
    let (swap_total, swap_used) = pair("SWAP");
    let (disk_total, disk_used) = pair("DISK");

    let (cpu1_total, cpu1_idle) = pair("CPU1");
    let (cpu2_total, cpu2_idle) = pair("CPU2");
    let cpu_percent = {
        let total_delta = cpu2_total.saturating_sub(cpu1_total) as f64;
        let idle_delta = cpu2_idle.saturating_sub(cpu1_idle) as f64;
        if total_delta > 0.0 {
            ((total_delta - idle_delta) / total_delta * 100.0).clamp(0.0, 100.0)
        } else {
            0.0
        }
    };

    let mut net_parts = get("NET").split_whitespace().filter_map(|t| t.parse::<u64>().ok());
    let rx1 = net_parts.next().unwrap_or(0);
    let tx1 = net_parts.next().unwrap_or(0);
    let rx2 = net_parts.next().unwrap_or(rx1);
    let tx2 = net_parts.next().unwrap_or(tx1);
    let sample_secs = 0.5;
    let net_rx_m_bs = (rx2.saturating_sub(rx1) as f64 / sample_secs) / (1024.0 * 1024.0);
    let net_tx_k_bs = (tx2.saturating_sub(tx1) as f64 / sample_secs) / 1024.0;

    let iface = get("IFACE");
    HostMetrics {
        ip: host.host.clone(),
        os: {
            let os = get("OS");
            if os.is_empty() {
                "Linux".into()
            } else {
                os.to_string()
            }
        },
        kernel: get("KERNEL").to_string(),
        arch: get("ARCH").to_string(),
        hostname: {
            let name = get("HOSTNAME");
            if name.is_empty() {
                host.name.clone()
            } else {
                name.to_string()
            }
        },
        uptime_days: extract_uptime_days(&uptime_text),
        uptime_text,
        load_avg: get("LOAD").to_string(),
        cpu_percent,
        mem_used_gi_b: bytes_to_gib(mem_used),
        mem_total_gi_b: bytes_to_gib(mem_total),
        swap_used_mi_b: bytes_to_mib(swap_used),
        swap_total_mi_b: bytes_to_mib(swap_total),
        disk_used_gi_b: bytes_to_gib(disk_used),
        disk_total_gi_b: bytes_to_gib(disk_total),
        net_iface: if iface.is_empty() {
            "—".into()
        } else {
            iface.to_string()
        },
        net_rx_m_bs,
        net_tx_k_bs,
        net_rx_total_g_b: rx2 as f64 / 1_000_000_000.0,
        net_tx_total_g_b: tx2 as f64 / 1_000_000_000.0,
        top_processes,
    }
}

fn extract_uptime_days(line: &str) -> u64 {
    if let Some(idx) = line.find("up ") {
        let rest = &line[idx + 3..];
        if let Some(day_idx) = rest.find(" day") {
            return rest[..day_idx]
                .split(',')
                .next()
                .and_then(|s| s.trim().parse().ok())
                .unwrap_or(0);
        }
    }
    0
}

fn bytes_to_gib(v: u64) -> f64 {
    v as f64 / 1024.0 / 1024.0 / 1024.0
}

fn bytes_to_mib(v: u64) -> f64 {
    v as f64 / 1024.0 / 1024.0
}
