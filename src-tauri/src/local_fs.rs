//! 本机路径展开：拖拽上传时把文件/文件夹展平为远端相对路径列表。

use crate::error::{AppError, AppResult};
use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalUploadItem {
    pub local_path: String,
    /// 相对上传目标的路径，如 `folder/a.txt` 或 `a.txt`
    pub remote_relative: String,
    pub is_dir: bool,
}

pub fn expand_local_upload(path: &str) -> AppResult<Vec<LocalUploadItem>> {
    let root = PathBuf::from(path.trim());
    if path.trim().is_empty() {
        return Err(AppError::Message("本地路径无效".into()));
    }
    if !root.exists() {
        return Err(AppError::Message(format!(
            "本地路径不存在: {}",
            root.display()
        )));
    }

    if root.is_file() {
        let name = root
            .file_name()
            .and_then(|s| s.to_str())
            .ok_or_else(|| AppError::Message("本地文件名无效".into()))?;
        return Ok(vec![LocalUploadItem {
            local_path: root.to_string_lossy().into_owned(),
            remote_relative: name.to_string(),
            is_dir: false,
        }]);
    }

    if root.is_dir() {
        let root_name = root
            .file_name()
            .and_then(|s| s.to_str())
            .ok_or_else(|| AppError::Message("本地文件夹名无效".into()))?;
        let mut items = Vec::new();
        items.push(LocalUploadItem {
            local_path: root.to_string_lossy().into_owned(),
            remote_relative: root_name.to_string(),
            is_dir: true,
        });
        walk_dir(&root, root_name, &mut items)?;
        return Ok(items);
    }

    Err(AppError::Message("不支持的本地路径类型".into()))
}

fn walk_dir(dir: &Path, relative: &str, out: &mut Vec<LocalUploadItem>) -> AppResult<()> {
    let entries =
        fs::read_dir(dir).map_err(|e| AppError::Message(format!("读取本地目录失败: {e}")))?;
    for entry in entries {
        let entry = entry.map_err(|e| AppError::Message(format!("读取本地目录失败: {e}")))?;
        let path = entry.path();
        let name = entry.file_name();
        let name = name
            .to_str()
            .ok_or_else(|| AppError::Message("本地文件名无效".into()))?;
        let rel = format!("{relative}/{name}");
        let meta = entry
            .metadata()
            .map_err(|e| AppError::Message(format!("读取本地文件信息失败: {e}")))?;
        if meta.is_dir() {
            out.push(LocalUploadItem {
                local_path: path.to_string_lossy().into_owned(),
                remote_relative: rel.clone(),
                is_dir: true,
            });
            walk_dir(&path, &rel, out)?;
        } else if meta.is_file() {
            out.push(LocalUploadItem {
                local_path: path.to_string_lossy().into_owned(),
                remote_relative: rel,
                is_dir: false,
            });
        }
    }
    Ok(())
}
