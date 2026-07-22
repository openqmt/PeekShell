---
title: 介绍
description: 了解 PeekShell：轻量跨平台 SSH 客户端，主机管理、多标签终端、远程文件与确认式 AI Agent。
---

# 介绍

PeekShell 是一款轻量跨平台 SSH 客户端，面向 Windows / macOS / Linux，核心能力包括主机管理、多标签终端、远程文件浏览，以及「提议命令 → 用户确认 → 执行」的 AI Agent。

## 为什么做 PeekShell

传统 SSH 客户端功能完整但往往偏重；纯 AI 助手又容易在远端误执行危险命令。PeekShell 把两者合在一起，同时坚持：**默认禁止自动执行，每条 AI 提议的命令都要人工确认**。

## 技术栈

| 层级 | 选型 |
| --- | --- |
| 桌面壳 | Tauri 2 |
| 后端 | Rust（SSH、存储、系统集成） |
| 前端 | Vue 3 + TypeScript + Vite |
| 终端 | xterm.js |
| AI | OpenAI 兼容 API（用户自带 Key） |

## 当前能力

- 主机分组、新增 / 编辑 / 删除连接
- 密码与私钥认证
- 多标签 SSH 终端
- 连接后主机系统与资源概览
- 远程文件浏览与传输
- 中英文界面
- 深色 / 浅色主题

AI Agent 按路线图推进：配置与对话入口已就绪，完整「提议 → 确认 → 执行 → 回灌」闭环仍在完善中。

## 下一步

继续阅读 [快速开始](/guide/getting-started)，从源码运行 PeekShell。
