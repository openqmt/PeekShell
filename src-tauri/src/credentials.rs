//! 凭证存系统钥匙串，主机 JSON 中不落明文密码/口令。

use crate::error::{AppError, AppResult};
use keyring::Entry;

const SERVICE: &str = "PeekShell";

fn entry(host_id: &str, kind: &str) -> AppResult<Entry> {
    Ok(Entry::new(SERVICE, &format!("{host_id}/{kind}"))?)
}

pub fn set_secret(host_id: &str, kind: &str, value: &str) -> AppResult<()> {
    entry(host_id, kind)?.set_password(value)?;
    Ok(())
}

pub fn get_secret(host_id: &str, kind: &str) -> AppResult<Option<String>> {
    match entry(host_id, kind)?.get_password() {
        Ok(v) => Ok(Some(v)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(AppError::from(e)),
    }
}

pub fn delete_secret(host_id: &str, kind: &str) -> AppResult<()> {
    match entry(host_id, kind)?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(AppError::from(e)),
    }
}

pub fn delete_all_secrets(host_id: &str) -> AppResult<()> {
    delete_secret(host_id, "password")?;
    delete_secret(host_id, "passphrase")?;
    Ok(())
}
