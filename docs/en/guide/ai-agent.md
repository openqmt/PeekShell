# AI assistant

PeekShell’s AI agent rule is simple: **the model may propose; it must not execute on its own**.

## Intended loop

1. Gather context: host info, cwd, recent terminal output, your question
2. Model returns structured output: explanation + command list (with risk levels)
3. UI shows commands and risk; you approve, reject, or edit before run
4. Run in the current SSH session and capture output
5. Feed results back to the model for the next step (every round still needs confirmation)

## Safety

- Auto-execute is off by default
- High-risk commands (recursive deletes, firewall changes, system writes) should require a second confirm
- API keys stay local; OpenAI-compatible endpoints are supported (including local Ollama)
- Proposals and executions should be audited locally as the feature matures

## Current status

You can configure an AI provider (Base URL / Model / API Key) in settings. The full agent loop is still Phase 2 work — follow in-app messaging for what is live.

Once configured, ask in the right-hand AI panel, e.g. “check nginx error logs”.
