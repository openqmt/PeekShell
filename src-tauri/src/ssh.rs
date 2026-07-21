//! SSH 会话管理：交互式 PTY + 指标采集。
//! 远端输出通过 Tauri 事件 `pty://{session_id}` 推到前端。

use crate::credentials;
use crate::error::{AppError, AppResult};
use crate::hosts::{self, AuthType, HostRecord};
use async_trait::async_trait;
use russh::client::{self, Handle, Msg};
use russh::ChannelMsg;
use russh_keys::key::KeyPair;
use serde::Serialize;
use std::collections::HashMap;
use std::path::Path;
use std::sync::Arc;
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

struct LiveSession {
    handle: Handle<ClientHandler>,
    writer: mpsc::Sender<PtyCmd>,
    host_id: String,
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

        // 读远端输出 → 前端；同时消费本地写入与窗口大小变更
        let app_read = app.clone();
        let event_read = event_name.clone();
        tokio::spawn(async move {
            let mut channel = channel;
            loop {
                tokio::select! {
                    msg = channel.wait() => {
                        match msg {
                            Some(ChannelMsg::Data { ref data }) => {
                                let text = String::from_utf8_lossy(data).to_string();
                                let _ = app_read.emit(&event_read, text);
                            }
                            Some(ChannelMsg::ExtendedData { ref data, .. }) => {
                                let text = String::from_utf8_lossy(data).to_string();
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
        let host_id = {
            let map = self.inner.lock().await;
            map.get(session_id)
                .map(|s| s.host_id.clone())
                .ok_or_else(|| AppError::Message("会话不存在".into()))?
        };
        let host = hosts::get_host(&host_id)?;
        collect_metrics(&host).await
    }
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

/// 用独立短连接执行只读探测，避免干扰交互式 PTY。
async fn collect_metrics(host: &HostRecord) -> AppResult<HostMetrics> {
    let script = r#"
hostname; uname -s; uname -r; uname -m
cat /etc/os-release 2>/dev/null | grep -E '^PRETTY_NAME=' | head -1 | cut -d= -f2 | tr -d '"'
uptime
free -b 2>/dev/null | awk '/Mem:/{print $2,$3} /Swap:/{print $2,$3}'
df -B1 / 2>/dev/null | awk 'NR==2{print $2,$3}'
cat /proc/loadavg 2>/dev/null
ip -o -4 addr show scope global 2>/dev/null | awk '{print $2,$4}' | head -1
"#;

    let output = run_exec(host, script).await.unwrap_or_default();
    Ok(parse_metrics(host, &output))
}

async fn run_exec(host: &HostRecord, command: &str) -> AppResult<String> {
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
    let mut buf = String::new();
    while let Some(msg) = channel.wait().await {
        if let ChannelMsg::Data { ref data } = msg {
            buf.push_str(&String::from_utf8_lossy(data));
        }
    }
    Ok(buf)
}

fn parse_metrics(host: &HostRecord, raw: &str) -> HostMetrics {
    let lines: Vec<&str> = raw.lines().map(str::trim).filter(|l| !l.is_empty()).collect();
    let hostname = lines.first().unwrap_or(&host.name.as_str()).to_string();
    let kernel = lines.get(2).unwrap_or(&"").to_string();
    let arch = lines.get(3).unwrap_or(&"").to_string();
    let os = lines
        .iter()
        .find(|l| l.contains("Ubuntu") || l.contains("Linux") || l.contains("Debian") || l.contains("CentOS"))
        .copied()
        .unwrap_or("Linux")
        .to_string();

    let uptime_line = lines.iter().find(|l| l.contains("up ")).copied().unwrap_or("");
    let uptime_days = extract_uptime_days(uptime_line);
    let load_avg = lines
        .iter()
        .find(|l| l.split_whitespace().count() >= 3 && l.contains('.'))
        .map(|l| l.split_whitespace().take(3).collect::<Vec<_>>().join(" "))
        .unwrap_or_default();

    // free / df 粗解析：取前两个数字对
    let nums: Vec<u64> = raw
        .split_whitespace()
        .filter_map(|t| t.parse::<u64>().ok())
        .collect();

    let (mem_total, mem_used) = (nums.first().copied().unwrap_or(0), nums.get(1).copied().unwrap_or(0));
    let (swap_total, swap_used) = (nums.get(2).copied().unwrap_or(0), nums.get(3).copied().unwrap_or(0));
    let (disk_total, disk_used) = (nums.get(4).copied().unwrap_or(0), nums.get(5).copied().unwrap_or(0));

    HostMetrics {
        ip: host.host.clone(),
        os,
        kernel,
        arch,
        hostname,
        uptime_days,
        uptime_text: uptime_line.to_string(),
        load_avg,
        cpu_percent: 0.0,
        mem_used_gi_b: bytes_to_gib(mem_used),
        mem_total_gi_b: bytes_to_gib(mem_total),
        swap_used_mi_b: bytes_to_mib(swap_used),
        swap_total_mi_b: bytes_to_mib(swap_total),
        disk_used_gi_b: bytes_to_gib(disk_used),
        disk_total_gi_b: bytes_to_gib(disk_total),
        net_iface: "eth0".into(),
        net_rx_m_bs: 0.0,
        net_tx_k_bs: 0.0,
        net_rx_total_g_b: 0.0,
        net_tx_total_g_b: 0.0,
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
