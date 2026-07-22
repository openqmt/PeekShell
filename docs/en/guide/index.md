---
title: Introduction
description: Learn about PeekShell — a lightweight cross-platform SSH client with hosts, multi-tab terminal, remote files, and a confirmation-first AI agent.
---

# Introduction

PeekShell is a lightweight cross-platform SSH client for Windows, macOS, and Linux. It focuses on host management, multi-tab terminals, remote file browsing, and an AI agent that follows a **propose → confirm → execute** loop.

## Why PeekShell

Classic SSH clients are powerful but often heavy. Pure AI assistants can run dangerous commands on remote hosts by mistake. PeekShell combines both, with a hard rule: **never auto-execute by default — every AI-proposed command needs your approval**.

## Stack

| Layer | Choice |
| --- | --- |
| Desktop shell | Tauri 2 |
| Backend | Rust (SSH, storage, OS integration) |
| Frontend | Vue 3 + TypeScript + Vite |
| Terminal | xterm.js |
| AI | OpenAI-compatible APIs (bring your own key) |

## What works today

- Host groups and CRUD for connections
- Password and private-key authentication
- Multi-tab SSH terminals
- Post-connect system and resource overview
- Remote file browsing and transfers
- Chinese / English UI
- Dark / light themes

The AI agent is on the roadmap: provider settings and chat entry points are in place; the full propose → confirm → execute → feedback loop is still being finished.

## Next

Continue with [Quick start](/en/guide/getting-started) to run PeekShell from source.
