# PeekShell Development Guidelines

These conventions define coding and collaboration standards for PeekShell (Tauri 2 + Rust + Vue 3 / TypeScript / Vite). Commits and reviews should follow this document.

---

## 1. Core Principles

1. **Write only necessary code**: Do not add unused variables, functions, types, or files “just in case.”
2. **No redundancy**: Keep each piece of logic in one place; delete unused bindings, parameters, branches, and commented-out old code.
3. **Comments explain intent**: Comments should explain *why* and *constraints*, not restate what the code already says.
4. **Keep changes small**: Touch only code related to the current task; no unrelated refactors or whole-file drive-by formatting.
5. **Match existing style**: Follow the repo’s naming, layout, error handling, and component patterns.

---

## 2. No Redundant Variables or Functions

### 2.1 Variables

- Do not declare variables, constants, or destructured fields that are never read.
- Do not introduce a one-step “pass-through” assignment (prefer using the expression directly) unless the name clearly improves readability.
- Do not use `let` for bindings that are never reassigned (use `const` / Rust immutable bindings).
- Avoid stacking meaningless boolean flags; prefer early returns or enums over nested `if (flag1 && flag2)`.

```ts
// Bad: intermediate names that don’t help readability and often become dead
const raw = props.host.ip
const ip = raw
connect(ip)

// Better
connect(props.host.ip)
```

### 2.2 Functions and Methods

- Do not leave uncalled functions, methods, components, composables, or Rust `fn`s.
- Do not wrap a call in a pass-through function that only forwards inputs with no validation, logging, or adaptation.
- Do not copy-paste nearly identical functions; extract shared logic or keep one parameterized version.
- When removing a feature, also remove helpers and types used only by that feature.

### 2.3 Frontend / Backend Conventions

| Location | Requirement |
|----------|-------------|
| Vue / TS | Unused `import`s, props, emits, and Pinia state/actions must be removed |
| Rust | Unused `use`s, struct fields, and `#[tauri::command]`s (when the frontend no longer calls them) must be removed |
| Shared types | Keep in `packages/shared` only schemas actually used by both sides |

---

## 3. Comment Guidelines

### 3.1 Where Comments Are Required

- **Module / file header**: File responsibility and layer (SSH / Agent / UI / storage).
- **Exported public APIs**: Tauri commands, Pinia store actions, reusable composables.
- **Non-obvious business rules**: e.g. command risk tiers, why auto-execution is forbidden, why credentials go through the keychain.
- **Security and concurrency**: SSH session lifecycle, execute-only-after-approval, redaction rules, locks and async boundaries.
- **Workarounds and temporary solutions**: Note the reason and when they can be removed (avoid permanent “temporary” code).

### 3.2 What Comments Should Say

```ts
// Good: states the constraint and reason
// Must be user-confirmed first: AI-proposed commands must not be written directly to the PTY
async function executeApproved(commandId: string) { ... }

// Bad: restates the code
// Execute the command
async function executeApproved(commandId: string) { ... }
```

```rust
/// Collect remote host metrics for the sidebar and AI context.
/// On failure, return the last successful snapshot to avoid UI flicker.
pub async fn collect_host_metrics(session_id: &str) -> Result<HostMetrics> { ... }
```

### 3.3 What Not to Comment

- Do not comment what types and names already make obvious.
- Do not keep large deleted blocks in comments (use Git history).
- Do not leave contradictory or stale comments; update comments when code changes.
- English is preferred for this document and for code comments; keep style consistent within a file.

### 3.4 Recommended Format

- TypeScript / Vue: `//` line comments; short block comments for complex logic when needed.
- Rust: `///` doc comments for public items; `//` inside modules.
- Components: for non-trivial interactions (collapsible sidebar, confirmation card state machine), briefly describe the data flow at the top of `<script>`.

---

## 4. Stack-Specific Notes

### 4.1 Vue 3 + TypeScript

- Prefer Composition API + `<script setup lang="ts">`.
- One responsibility per component; split host list, connect dialog, terminal, and AI panel—avoid giant single files.
- State: Pinia for cross-page / cross-panel state; `ref` / `reactive` for local UI only.
- Avoid complex expressions in templates; move them to computed or functions when that improves reuse or readability.

### 4.2 Rust / Tauri

- SSH, credentials, and command execution live in Rust; the frontend handles display and user confirmation only.
- Command input/output types must be explicit; avoid shuttling loose `Value` / `any`.
- Return distinguishable error types or codes to the frontend so users can be prompted clearly.

### 4.3 AI Agent

- Proposal and execution must be separated; the execution entry accepts only an “approved” command id.
- Risk tiering, redaction, and audit logic belong in clear modules with thorough comments.

---

## 5. Naming and Structure

- Names should express purpose: `hostList`, `collectHostMetrics`, `executeApprovedCommand`.
- Booleans use `is` / `has` / `can` prefixes: `isCollapsed`, `canExecute`.
- File names should match export responsibility; don’t let `utils.ts` grow forever—split by domain (e.g. `ssh/`, `agent/`, `hosts/`).

---

## 6. Pre-Commit Checklist

Before committing or opening a PR, confirm:

- [ ] No unused variables, functions, imports, or dead code
- [ ] No meaningless one-layer wrappers
- [ ] Necessary comments on public APIs, security, and business constraints
- [ ] Comments match the code; no stale notes
- [ ] No unrelated changes mixed into the task
- [ ] Local build / typecheck passes (`vue-tsc` / `cargo check`, etc.)

---

## 7. Relation to the Plan

Product architecture and tech choices: [Plan.md](./Plan.md).  
UI interaction preview: [Preview.html](./Preview.html).  

This document governs *how* to write code; feature scope is defined by the Plan.
