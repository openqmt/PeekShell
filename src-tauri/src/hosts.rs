//! 主机配置持久化：应用数据目录下的 hosts.json。

use crate::credentials;
use crate::error::{AppError, AppResult};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum AuthType {
    Password,
    PrivateKey,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HostRecord {
    pub id: String,
    pub name: String,
    pub group: String,
    pub host: String,
    pub port: u16,
    pub note: String,
    pub username: String,
    pub auth_type: AuthType,
    #[serde(default)]
    pub private_key_path: Option<String>,
    /// 是否已在钥匙串中保存对应密钥（密码或私钥口令可选，密码模式必须有）
    pub has_secret: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HostUpsert {
    pub id: Option<String>,
    pub name: String,
    pub group: String,
    pub host: String,
    pub port: u16,
    pub note: String,
    pub username: String,
    pub auth_type: AuthType,
    pub password: Option<String>,
    pub private_key_path: Option<String>,
    pub passphrase: Option<String>,
}

#[derive(Default, Serialize, Deserialize)]
struct HostStoreFile {
    hosts: Vec<HostRecord>,
}

fn data_dir() -> AppResult<PathBuf> {
    let base = dirs::data_dir().ok_or_else(|| AppError::Message("无法定位数据目录".into()))?;
    let dir = base.join("PeekShell");
    fs::create_dir_all(&dir)?;
    Ok(dir)
}

fn store_path() -> AppResult<PathBuf> {
    Ok(data_dir()?.join("hosts.json"))
}

fn load_file() -> AppResult<HostStoreFile> {
    let path = store_path()?;
    if !path.exists() {
        return Ok(HostStoreFile::default());
    }
    let raw = fs::read_to_string(path)?;
    Ok(serde_json::from_str(&raw)?)
}

fn save_file(file: &HostStoreFile) -> AppResult<()> {
    let path = store_path()?;
    let raw = serde_json::to_string_pretty(file)?;
    fs::write(path, raw)?;
    Ok(())
}

pub fn list_hosts() -> AppResult<Vec<HostRecord>> {
    let mut hosts = load_file()?.hosts;
    hosts.sort_by(|a, b| a.group.cmp(&b.group).then(a.name.cmp(&b.name)));
    Ok(hosts)
}

pub fn get_host(id: &str) -> AppResult<HostRecord> {
    load_file()?
        .hosts
        .into_iter()
        .find(|h| h.id == id)
        .ok_or_else(|| AppError::Message(format!("主机不存在: {id}")))
}

pub fn upsert_host(payload: HostUpsert) -> AppResult<HostRecord> {
    if payload.name.trim().is_empty() || payload.host.trim().is_empty() || payload.username.trim().is_empty()
    {
        return Err(AppError::Message("名称、主机 IP、用户名不能为空".into()));
    }
    if payload.port == 0 {
        return Err(AppError::Message("端口无效".into()));
    }

    let mut file = load_file()?;
    let id = payload
        .id
        .clone()
        .unwrap_or_else(|| Uuid::new_v4().to_string());

    match payload.auth_type {
        AuthType::Password => {
            if let Some(password) = payload.password.as_ref().filter(|p| !p.is_empty()) {
                credentials::set_secret(&id, "password", password)?;
            } else if payload.id.is_none() {
                return Err(AppError::Message("密码认证需要填写密码".into()));
            }
            credentials::delete_secret(&id, "passphrase")?;
        }
        AuthType::PrivateKey => {
            if payload
                .private_key_path
                .as_ref()
                .map(|p| p.trim().is_empty())
                .unwrap_or(true)
            {
                return Err(AppError::Message("公钥认证需要加载私钥文件".into()));
            }
            if let Some(passphrase) = payload.passphrase.as_ref() {
                if passphrase.is_empty() {
                    credentials::delete_secret(&id, "passphrase")?;
                } else {
                    credentials::set_secret(&id, "passphrase", passphrase)?;
                }
            }
            credentials::delete_secret(&id, "password")?;
        }
    }

    let has_secret = match payload.auth_type {
        AuthType::Password => credentials::get_secret(&id, "password")?.is_some(),
        AuthType::PrivateKey => true,
    };

    let record = HostRecord {
        id: id.clone(),
        name: payload.name.trim().to_string(),
        group: if payload.group.trim().is_empty() {
            "未分组".into()
        } else {
            payload.group.trim().to_string()
        },
        host: payload.host.trim().to_string(),
        port: payload.port,
        note: payload.note,
        username: payload.username.trim().to_string(),
        auth_type: payload.auth_type,
        private_key_path: payload.private_key_path,
        has_secret,
    };

    if let Some(existing) = file.hosts.iter_mut().find(|h| h.id == id) {
        *existing = record.clone();
    } else {
        file.hosts.push(record.clone());
    }
    save_file(&file)?;
    Ok(record)
}

pub fn delete_host(id: &str) -> AppResult<()> {
    let mut file = load_file()?;
    let before = file.hosts.len();
    file.hosts.retain(|h| h.id != id);
    if file.hosts.len() == before {
        return Err(AppError::Message(format!("主机不存在: {id}")));
    }
    credentials::delete_all_secrets(id)?;
    save_file(&file)?;
    Ok(())
}

pub fn rename_group(from: &str, to: &str) -> AppResult<()> {
    let to = to.trim();
    if to.is_empty() {
        return Err(AppError::Message("分组名不能为空".into()));
    }
    let mut file = load_file()?;
    for host in &mut file.hosts {
        if host.group == from {
            host.group = to.to_string();
        }
    }
    save_file(&file)?;
    Ok(())
}

/// 删除分组：组内主机移到「未分组」，不删除主机本身。
pub fn delete_group(group: &str) -> AppResult<()> {
    let mut file = load_file()?;
    for host in &mut file.hosts {
        if host.group == group {
            host.group = "未分组".into();
        }
    }
    save_file(&file)?;
    Ok(())
}
