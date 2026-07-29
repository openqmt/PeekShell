---
title: AI assistant
description: PeekShell AI agent — Confirm all, Smart, and Auto run modes, with a propose → confirm → execute loop.
---

# AI assistant

PeekShell’s AI agent rule is: **the model may propose; whether commands run automatically depends on the execution mode you choose**. The default is **Confirm all** — nothing is written to the remote host until you approve.

## Execution modes

Switch modes at the top of the Assist panel (the choice is remembered). Each proposed command carries a risk level (low / medium / high). Local heuristics can raise obviously dangerous commands (e.g. `rm -rf`, writes under `/etc`) so the model cannot under-report risk.

| Mode | Behavior | Best for |
|------|----------|----------|
| **Confirm all** (default) | Every command needs your Approve click (or **y** in the terminal) before it runs | Production hosts, unfamiliar environments, safest everyday use |
| **Smart** | **Low-risk** read-only commands auto-run; **medium / high** still need confirmation | Faster troubleshooting (`ls`, `df`, `journalctl`, …) while guarding state changes |
| **Auto run** | Every proposed command runs immediately with no per-command confirm | Trusted dev/test machines only — not recommended on production |

Notes:

- **Confirm all**: full propose → confirm → execute loop; matches the default safety policy.
- **Smart**: balances speed and safety — low risk skips the click; medium/high behave like Confirm all.
- **Auto run**: fastest, but a bad proposal executes at once; switch only when the host can tolerate mistakes.

With no host connected, all three modes only show suggested commands and never run them remotely.

## Intended loop

1. Gather context: host info, cwd, recent terminal output, your question
2. Model returns structured output: explanation + command list (with risk levels)
3. Follow the current **execution mode**: auto-run, or wait for approve / reject in the UI or terminal
4. Run in the current SSH session and capture output
5. Feed results back to the model for the next step (commands that still require confirm must be approved each round)

## Safety

- Default mode is **Confirm all** — no unapproved auto-execution
- Dangerous commands are elevated to high risk locally; they still need confirm under Smart, and always under Confirm all
- API keys stay local; OpenAI-compatible endpoints are supported (including local Ollama)
- Proposals and executions should be audited locally as the feature matures

## Asking questions

Configure a provider (Base URL / Model / API Key) in settings, then ask in the Assist panel, e.g. “check nginx error logs”. You can also chat from the terminal with **Ctrl+I** (see the Chinese guide for the full terminal AI flow until this page is expanded).
