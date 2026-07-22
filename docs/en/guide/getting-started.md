---
title: Quick start
description: Install and run PeekShell from source with Node.js, Rust, and Tauri prerequisites.
---

# Quick start

## Requirements

- [Node.js](https://nodejs.org/) 18+
- [Rust](https://www.rust-lang.org/) stable toolchain
- Platform-specific Tauri prerequisites ([docs](https://v2.tauri.app/start/prerequisites/))

## Install

```bash
git clone https://github.com/openqmt/PeekShell.git
cd PeekShell
npm install
```

## Development

```bash
npm run tauri-dev
```

This starts the Vite frontend and the Tauri desktop window. For frontend-only work:

```bash
npm run dev
```

## Build

```bash
npm run build
# Full desktop installers:
# npx tauri build
```

## Documentation site

This site is powered by VitePress. Sources live under `docs/` in the repo:

```bash
npm run docs:dev      # local preview
npm run docs:build    # static build
npm run docs:preview  # preview the build
```

## Next

- [Hosts](/en/guide/hosts) — add and organize SSH hosts
- [Terminal](/en/guide/terminal) — multi-tab sessions and host overview
- [Remote files](/en/guide/remote-explorer) — browse and transfer files
- [AI assistant](/en/guide/ai-agent) — configuration and confirmation flow
