# PeekShell

A lightweight, cross-platform SSH client built with Tauri 2, Rust, and Vue 3, featuring an AI agent that asks for confirmation before executing actions (Phase 2).

## Documentation

- Official site / docs (VitePress, zh / en): see [`docs/`](./docs/)
- [Plan.md](./Plan.md) — Architecture and roadmap
- [AGENT.md](./AGENT.md) — Coding standards
- [Preview.html](./Preview.html) — UI design preview

```bash
npm run docs:dev      # preview docs at http://localhost:5173
npm run docs:build
npm run docs:preview
```

## Development

```bash
npm install
npm run tauri-dev
```

## Build

```bash
npm run build
npx tauri build
```
