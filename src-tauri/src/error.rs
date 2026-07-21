//! 统一错误类型，便于前端展示可读消息。

use serde::Serialize;

#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("{0}")]
    Message(String),
    #[error(transparent)]
    Other(#[from] anyhow::Error),
}

impl Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}

pub type AppResult<T> = Result<T, AppError>;

impl From<std::io::Error> for AppError {
    fn from(value: std::io::Error) -> Self {
        AppError::Message(value.to_string())
    }
}

impl From<serde_json::Error> for AppError {
    fn from(value: serde_json::Error) -> Self {
        AppError::Message(value.to_string())
    }
}

impl From<uuid::Error> for AppError {
    fn from(value: uuid::Error) -> Self {
        AppError::Message(value.to_string())
    }
}

impl From<keyring::Error> for AppError {
    fn from(value: keyring::Error) -> Self {
        AppError::Message(value.to_string())
    }
}

impl From<russh::Error> for AppError {
    fn from(value: russh::Error) -> Self {
        AppError::Message(value.to_string())
    }
}

impl From<russh_keys::Error> for AppError {
    fn from(value: russh_keys::Error) -> Self {
        AppError::Message(value.to_string())
    }
}
