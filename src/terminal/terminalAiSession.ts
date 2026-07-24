/**
 * 终端内 AI 会话：本地 compose、流式输出、y/n 确认。
 * 与 shell 切换尽量少噪音：无大横幅、命令执行后按输出空闲回到 AI>。
 */
import type { Terminal } from "@xterm/xterm";
import type { MessageKey } from "../i18n";
import type { AgentCommand, RiskLevel } from "../types/ai";
import { useAiStore } from "../stores/ai";
import { looksLikeShellCommand } from "./shellDetect";
import {
  applyCdFromCommand,
  extractCwdFromPrompt,
  looksLikeCommandEcho,
  looksLikeShellPrompt,
  stripAnsi,
} from "./ptyFilter";
import {
  filterCompletions,
  longestCommonPrefix,
  parseCompletionContext,
} from "./tabComplete";

export type TerminalAiPhase =
  | "shell"
  | "compose"
  | "streaming"
  | "awaitingConfirm"
  | "executing"
  /** Forward keys to PTY while a local shell command runs; return to compose on idle. */
  | "shellRelay";

export interface TerminalAiSessionOptions {
  /** Run a full command line on the remote PTY (adds Enter). */
  runShell: (command: string) => void;
  /** Raw PTY write (for shellRelay keystrokes). */
  writePty: (data: string) => void;
  /** List remote directory entries for Tab completion. */
  listDir: (path: string) => Promise<{ name: string; isDir: boolean }[]>;
  /** Fired when tracked cwd changes (PS1 / cd); may be `~` or absolute. */
  onCwdChange?: (cwd: string) => void;
}

const RESET = "\x1b[0m";
const DIM = "\x1b[2m";
const BOLD = "\x1b[1m";
const CYAN = "\x1b[36m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const RED = "\x1b[31m";

const RISK_COLOR: Record<RiskLevel, string> = {
  low: GREEN,
  medium: YELLOW,
  high: RED,
};

const RISK_KEY: Record<RiskLevel, MessageKey> = {
  low: "ai.risk.low",
  medium: "ai.risk.medium",
  high: "ai.risk.high",
};

/** Quiet period after last kept PTY chunk before restoring AI>. */
const SHELL_IDLE_MS = 280;
/** Max wait in shellRelay before restoring AI> even if still noisy. */
const SHELL_RELAY_MAX_MS = 8000;

export interface TerminalAiSession {
  readonly phase: TerminalAiPhase;
  isCapturing(): boolean;
  toggleCompose(): void;
  enterAndSend(text: string): void;
  tryHandleData(data: string): boolean;
  /**
   * Filter remote PTY bytes while in shellRelay.
   * Returns `null` to write unchanged; otherwise write the returned string (may be empty).
   */
  consumePtyOutput(data: string): string | null;
  /** Always call on PTY chunks to keep cwd in sync from PS1. */
  notePtyOutput(data: string): void;
  dispose(): void;
}

export function createTerminalAiSession(
  term: Terminal,
  t: (key: MessageKey) => string,
  options: TerminalAiSessionOptions
): TerminalAiSession {
  let phase: TerminalAiPhase = "shell";
  let lineBuf = "";
  let pending: AgentCommand[] = [];
  let disposed = false;
  let abortRender = false;
  let shownHint = false;
  let promptTimer: ReturnType<typeof setTimeout> | null = null;
  let relayIdleTimer: ReturnType<typeof setTimeout> | null = null;
  let relayMaxTimer: ReturnType<typeof setTimeout> | null = null;
  /** Command currently running via shellRelay (for echo suppression). */
  let relayCommand = "";
  /** Still waiting to drop the shell's echo of relayCommand. */
  let relayAwaitEcho = false;
  /** Raw incomplete line while filtering PTY in shellRelay. */
  let relayRawLine = "";
  /** Drop late PS1 for a short window after leaving shellRelay. */
  let postRelaySuppressUntil = 0;
  /** Tracked remote cwd for AI> path# prompt (from PS1 / cd). */
  let cwd = "~";
  /** Line buffer for notePtyOutput prompt scanning. */
  let noteLineBuf = "";
  let tabBusy = false;

  function setCwd(next: string) {
    if (!next || next === cwd) return;
    cwd = next;
    options.onCwdChange?.(cwd);
  }

  function setPhase(next: TerminalAiPhase) {
    phase = next;
  }

  function clearPromptTimer() {
    if (promptTimer) {
      clearTimeout(promptTimer);
      promptTimer = null;
    }
  }

  function clearRelayTimers() {
    if (relayIdleTimer) {
      clearTimeout(relayIdleTimer);
      relayIdleTimer = null;
    }
    if (relayMaxTimer) {
      clearTimeout(relayMaxTimer);
      relayMaxTimer = null;
    }
  }

  function resetRelayFilter() {
    relayCommand = "";
    relayAwaitEcho = false;
    relayRawLine = "";
  }

  function writeLocal(text: string) {
    if (disposed) return;
    term.write(text.replace(/\n/g, "\r\n"));
  }

  function writelnLocal(text = "") {
    writeLocal(text + "\r\n");
  }

  function writePrompt() {
    // AI> /path#   — path so cd results stay visible while in AI mode
    writeLocal(
      `${CYAN}AI>${RESET} ${DIM}${cwd}${RESET}${CYAN}#${RESET} `
    );
  }

  /** Soft enter: newline + optional one-time dim hint + AI>. */
  function enterCompose() {
    if (phase !== "shell") return;
    clearPromptTimer();
    clearRelayTimers();
    resetRelayFilter();
    setPhase("compose");
    lineBuf = "";
    writelnLocal("");
    if (!shownHint) {
      shownHint = true;
      writelnLocal(`${DIM}${t("termAi.bannerHint")}${RESET}`);
    }
    writePrompt();
  }

  function eraseComposeLine() {
    writeLocal("\r\x1b[2K");
    writePrompt();
    lineBuf = "";
  }

  /** Redraw `AI> path# ` + current lineBuf (after multi-match listing). */
  function redrawComposeInput() {
    writePrompt();
    if (lineBuf) writeLocal(lineBuf);
  }

  /** Accept ASCII / CJK / paste; reject Tab and control bytes (IME may send multi-char). */
  function isComposePrintable(data: string): boolean {
    if (!data) return false;
    for (const c of data) {
      if (c === "\t") return false;
      if (c < " ") return false;
    }
    return true;
  }

  async function doTabComplete() {
    if (tabBusy || phase !== "compose") return;
    const ctx = parseCompletionContext(lineBuf, cwd);
    if (!ctx) {
      writeLocal("\x07");
      return;
    }
    tabBusy = true;
    try {
      const entries = await options.listDir(ctx.listPath);
      const matches = filterCompletions(entries, ctx.prefix, ctx.dirsOnly);
      if (!matches.length) {
        writeLocal("\x07");
        return;
      }
      if (matches.length === 1) {
        const m = matches[0]!;
        const add =
          m.name.slice(ctx.prefix.length) + (m.isDir ? "/" : "");
        lineBuf += add;
        writeLocal(add);
        return;
      }
      const common = longestCommonPrefix(matches.map((m) => m.name));
      if (common.length > ctx.prefix.length) {
        const add = common.slice(ctx.prefix.length);
        lineBuf += add;
        writeLocal(add);
        return;
      }
      // Ambiguous: print candidates, then restore prompt + input
      writelnLocal("");
      writelnLocal(
        matches.map((m) => (m.isDir ? `${m.name}/` : m.name)).join("  ")
      );
      redrawComposeInput();
    } catch {
      writeLocal("\x07");
    } finally {
      tabBusy = false;
    }
  }

  /** Flush held PTY line when leaving relay; drop trailing PS1 if present. */
  function flushRelayRawLine(): string {
    if (!relayRawLine) return "";
    const held = relayRawLine;
    relayRawLine = "";
    const plain = stripAnsi(held).replace(/\r/g, "").trim();
    const path = extractCwdFromPrompt(plain);
    if (path) {
      setCwd(path);
      return "";
    }
    if (looksLikeShellPrompt(plain)) return "";
    if (relayAwaitEcho && looksLikeCommandEcho(plain, relayCommand)) {
      relayAwaitEcho = false;
      return "";
    }
    return held;
  }

  function returnToComposePrompt() {
    clearPromptTimer();
    clearRelayTimers();
    if (disposed) return;
    const trailing = flushRelayRawLine();
    if (trailing) {
      writeLocal(
        trailing.endsWith("\n") || trailing.endsWith("\r")
          ? trailing
          : `${trailing}\r\n`
      );
    }
    resetRelayFilter();
    lineBuf = "";
    setPhase("compose");
    // Do not insert an extra blank line — caller / agent echo already ended with \r\n.
    writePrompt();
  }

  function finishShellRelay() {
    if (phase !== "shellRelay") return;
    postRelaySuppressUntil = Date.now() + 700;
    returnToComposePrompt();
  }

  function armRelayIdle() {
    // Don't restore AI> until command echo is consumed (avoids cutting off real output).
    if (relayAwaitEcho) return;
    if (relayIdleTimer) clearTimeout(relayIdleTimer);
    relayIdleTimer = setTimeout(() => {
      relayIdleTimer = null;
      if (phase === "shellRelay") finishShellRelay();
    }, SHELL_IDLE_MS);
  }

  /**
   * Keep `AI> ls` on screen; run on PTY; show only command output (no echo / no PS1).
   */
  function runAsShell(command: string) {
    clearPromptTimer();
    clearRelayTimers();
    resetRelayFilter();
    // Finish the compose line as typed: AI> /path# ls
    writelnLocal("");
    lineBuf = "";
    relayCommand = command;
    relayAwaitEcho = true;
    setCwd(applyCdFromCommand(cwd, command));
    setPhase("shellRelay");
    options.runShell(command);
    relayMaxTimer = setTimeout(() => {
      relayMaxTimer = null;
      if (phase === "shellRelay") finishShellRelay();
    }, SHELL_RELAY_MAX_MS);
  }

  /** Quiet exit: clear AI> line; refresh remote PS1 so shell looks ready. */
  function exitCompose() {
    if (phase === "shell") return;
    clearPromptTimer();
    clearRelayTimers();
    postRelaySuppressUntil = 0;
    abortRender = true;
    pending = [];
    lineBuf = "";
    if (phase === "compose" || phase === "shellRelay") {
      writeLocal("\r\x1b[2K");
    } else {
      writelnLocal("");
    }
    setPhase("shell");
    // Agent exec no longer redraws PS1; refresh once when leaving AI mode.
    options.writePty("\x15\n");
  }

  function toggleCompose() {
    if (phase === "shell") {
      enterCompose();
      return;
    }
    exitCompose();
  }

  function showConfirmPrompt(cmd: AgentCommand) {
    writelnLocal("");
    writelnLocal(
      `${RISK_COLOR[cmd.risk]}${BOLD}[${t(RISK_KEY[cmd.risk])}]${RESET} ${DIM}${cmd.rationale || ""}${RESET}`
    );
    writelnLocal(`${BOLD}$ ${cmd.command}${RESET}`);
    writeLocal(`${YELLOW}${t("termAi.confirmPrompt")}${RESET} `);
  }

  async function runConfirmQueue() {
    while (!disposed && pending.length > 0) {
      setPhase("awaitingConfirm");
      const cmd = pending[0]!;
      showConfirmPrompt(cmd);
      return;
    }
    returnToComposePrompt();
  }

  async function onApproveCurrent() {
    const cmd = pending.shift();
    if (!cmd) {
      returnToComposePrompt();
      return;
    }
        setPhase("executing");
    writelnLocal(`${DIM}${t("termAi.approved")}${RESET}`);
    const ai = useAiStore();
    const res = await ai.approve(cmd.id);
    if (disposed) return;
    if (!res) {
      writelnLocal(`${RED}${ai.error || t("termAi.execFailed")}${RESET}`);
    } else {
      setCwd(applyCdFromCommand(cwd, cmd.command));
      const parts = [
        res.result.exitCode != null ? `exit ${res.result.exitCode}` : "",
        res.result.stdout?.trim() ?? "",
        res.result.stderr?.trim() ? `stderr:\n${res.result.stderr.trim()}` : "",
        res.followUp?.trim() ?? "",
      ].filter(Boolean);
      if (parts.length) writelnLocal(parts.join("\n\n"));
    }
    if (pending.length) void runConfirmQueue();
    else returnToComposePrompt();
  }

  async function onRejectCurrent() {
    const cmd = pending.shift();
    if (!cmd) {
      returnToComposePrompt();
      return;
    }
    const ai = useAiStore();
    await ai.reject(cmd.id);
    if (disposed) return;
    writelnLocal(`${DIM}${t("termAi.rejected")}${RESET}`);
    if (pending.length) void runConfirmQueue();
    else returnToComposePrompt();
  }

  async function rejectAllRemaining() {
    const ai = useAiStore();
    const rest = pending.splice(0);
    for (const cmd of rest) {
      await ai.reject(cmd.id);
    }
    if (disposed) return;
    writelnLocal(`${DIM}${t("termAi.cancelled")}${RESET}`);
    returnToComposePrompt();
  }

  function startTurn(text: string) {
    const prompt = text.trim();
    if (!prompt) return;

    clearPromptTimer();
    clearRelayTimers();
    const ai = useAiStore();
    if (!ai.activeProvider) {
      writelnLocal(`${RED}${t("ai.err.noProvider")}${RESET}`);
      returnToComposePrompt();
      return;
    }
    if (ai.sending) {
      writelnLocal(`${DIM}${t("termAi.busy")}${RESET}`);
      returnToComposePrompt();
      return;
    }

    abortRender = false;
    setPhase("streaming");
    lineBuf = "";
    // Compact thinking marker (same line feel)
    writeLocal(`${DIM}…${RESET} `);

    void ai.send(prompt, {
      onChunk: (delta, fullVisible) => {
        if (disposed || abortRender) return;
        // First chunk: clear the "… " placeholder on this line
        if (fullVisible.length === delta.length) {
          writeLocal("\r\x1b[2K");
        }
        writeLocal(delta);
      },
      onComplete: (result) => {
        if (disposed || abortRender) {
          returnToComposePrompt();
          return;
        }
        // Agent mirror already ends with \r\n after [exit N]; avoid stacking blank lines.
        const hadAgentEcho = (result.commands ?? []).some(
          (c) =>
            c.autoExecuted ||
            c.status === "executed" ||
            c.status === "failed"
        );
        if (!hadAgentEcho) {
          writelnLocal("");
        }
        if (result.error === "noProvider") {
          if (hadAgentEcho) writelnLocal("");
          writelnLocal(`${RED}${t("ai.err.noProvider")}${RESET}`);
          returnToComposePrompt();
          return;
        }
        if (result.error === "busy") {
          if (hadAgentEcho) writelnLocal("");
          writelnLocal(`${DIM}${t("termAi.busy")}${RESET}`);
          returnToComposePrompt();
          return;
        }
        if (result.error) {
          if (hadAgentEcho) writelnLocal("");
          writelnLocal(`${RED}${result.error}${RESET}`);
        }

        const toConfirm = (result.commands ?? []).filter(
          (c) => c.status === "pendingConfirm"
        );
        const suggested = (result.commands ?? []).filter(
          (c) => c.status === "suggested"
        );
        for (const c of suggested) {
          writelnLocal(`${DIM}$ ${c.command}${RESET}`);
        }
        // Track cwd from auto-run agent commands (no PS1 refresh after exec).
        for (const c of result.commands ?? []) {
          if (c.autoExecuted || c.status === "executed") {
            setCwd(applyCdFromCommand(cwd, c.command));
          }
        }

        if (toConfirm.length) {
          pending = toConfirm;
          void runConfirmQueue();
        } else {
          returnToComposePrompt();
        }
      },
    });
  }

  function enterAndSend(text: string) {
    const prompt = text.trim();
    if (!prompt) return;
    clearPromptTimer();
    clearRelayTimers();
    if (phase === "shell") {
      setPhase("compose");
      if (!shownHint) {
        shownHint = true;
        writelnLocal("");
        writelnLocal(`${DIM}${t("termAi.bannerHint")}${RESET}`);
      } else {
        writelnLocal("");
      }
    }
    lineBuf = "";
    writelnLocal(`${CYAN}AI>${RESET} ${DIM}${cwd}${RESET}${CYAN}#${RESET} ${prompt}`);
    startTurn(prompt);
  }

  function handleComposeData(data: string): boolean {
    if (data === "\x1b") {
      if (lineBuf) eraseComposeLine();
      else exitCompose();
      return true;
    }
    if (data === "\r" || data === "\n" || data === "\r\n") {
      const text = lineBuf;
      lineBuf = "";
      if (!text.trim()) {
        writelnLocal("");
        writePrompt();
        return true;
      }
      if (looksLikeShellCommand(text)) {
        runAsShell(text.trim());
        return true;
      }
      writelnLocal("");
      startTurn(text);
      return true;
    }
    if (data === "\t") {
      void doTabComplete();
      return true;
    }
    if (data === "\x7f" || data === "\b") {
      if (lineBuf.length > 0) {
        const chars = [...lineBuf];
        const removed = chars.pop()!;
        lineBuf = chars.join("");
        // CJK / wide glyphs usually occupy 2 terminal cells
        const wide = /[\u1100-\u115F\u2329\u232A\u2E80-\uA4CF\uAC00-\uD7A3\uF900-\uFAFF\uFE10-\uFE19\uFE30-\uFE6F\uFF00-\uFF60\uFFE0-\uFFE6]/.test(
          removed
        );
        writeLocal(wide ? "\b \b\b \b" : "\b \b");
      }
      return true;
    }
    if (data === "\x15") {
      eraseComposeLine();
      return true;
    }
    if (data === "\x03") {
      exitCompose();
      return true;
    }
    // Single key or IME/paste commit (may be multiple CJK chars in one onData)
    if (isComposePrintable(data)) {
      lineBuf += data;
      writeLocal(data);
      return true;
    }
    // Ignore CSI / other controls
    return true;
  }

  function handleShellRelayData(data: string): boolean {
    // Esc → back to AI without killing remote job
    if (data === "\x1b") {
      finishShellRelay();
      return true;
    }
    options.writePty(data);
    return true;
  }

  function handleConfirmData(data: string): boolean {
    const key = data.toLowerCase();
    if (data === "\x1b" || data === "\x03") {
      void rejectAllRemaining();
      return true;
    }
    if (key === "y") {
      writeLocal("y\r\n");
      void onApproveCurrent();
      return true;
    }
    if (key === "n") {
      writeLocal("n\r\n");
      void onRejectCurrent();
      return true;
    }
    return true;
  }

  function tryHandleData(data: string): boolean {
    if (phase === "shell") return false;
    if (phase === "compose") return handleComposeData(data);
    if (phase === "shellRelay") return handleShellRelayData(data);
    if (phase === "awaitingConfirm") return handleConfirmData(data);
    if (phase === "streaming" || phase === "executing") {
      if (data === "\x03") {
        abortRender = true;
        pending = [];
        writelnLocal(`\r\n${DIM}${t("termAi.cancelled")}${RESET}`);
        returnToComposePrompt();
        return true;
      }
      return true;
    }
    return false;
  }

  /** After relay, keep dropping a trailing PS1 that arrives late. */
  function consumePostRelay(data: string): string {
    let emit = "";
    for (let i = 0; i < data.length; i++) {
      const c = data[i]!;
      relayRawLine += c;
      if (c !== "\n") continue;
      const raw = relayRawLine;
      relayRawLine = "";
      const plain = stripAnsi(raw).replace(/\r/g, "").replace(/\n$/, "").trimEnd();
      const path = extractCwdFromPrompt(plain);
      if (path) {
        setCwd(path);
        continue;
      }
      if (looksLikeShellPrompt(plain)) continue;
      emit += raw;
    }
    // Hold partial prompt
    if (relayRawLine) {
      const partial = stripAnsi(relayRawLine).replace(/\r/g, "").trim();
      if (looksLikeShellPrompt(partial)) {
        /* hold */
      } else {
        // Don't emit incomplete non-prompt mid-chunk during grace — hold until newline or grace ends
      }
    }
    return emit;
  }

  function consumePtyOutput(data: string): string | null {
    if (phase === "shellRelay") {
      let emit = "";
      for (let i = 0; i < data.length; i++) {
        const c = data[i]!;
        relayRawLine += c;
        if (c !== "\n") continue;

        const raw = relayRawLine;
        relayRawLine = "";
        const plain = stripAnsi(raw)
          .replace(/\r/g, "")
          .replace(/\n$/, "")
          .trimEnd();

        if (relayAwaitEcho && looksLikeCommandEcho(plain, relayCommand)) {
          relayAwaitEcho = false;
          armRelayIdle();
          continue;
        }
        if (looksLikeShellPrompt(plain)) {
          const path = extractCwdFromPrompt(plain);
          if (path) setCwd(path);
          relayAwaitEcho = false;
          armRelayIdle();
          continue;
        }

        emit += raw;
        armRelayIdle();
      }

      if (relayRawLine) {
        const partial = stripAnsi(relayRawLine).replace(/\r/g, "").trim();
        if (looksLikeShellPrompt(partial)) {
          // hold — dropped on idle flush
        }
      }

      if (!relayAwaitEcho) armRelayIdle();
      return emit;
    }

    if (Date.now() < postRelaySuppressUntil) {
      return consumePostRelay(data);
    }

    // Grace ended: flush any held non-prompt partial
    if (relayRawLine) {
      const held = relayRawLine;
      const plain = stripAnsi(held).replace(/\r/g, "").trim();
      relayRawLine = "";
      if (looksLikeShellPrompt(plain)) return "";
      return held + data;
    }

    return null;
  }

  /** Scan all PTY output for PS1 so cwd stays correct outside shellRelay too. */
  function notePtyOutput(data: string) {
    for (let i = 0; i < data.length; i++) {
      const c = data[i]!;
      noteLineBuf += c;
      if (c !== "\n") continue;
      const line = noteLineBuf;
      noteLineBuf = "";
      const path = extractCwdFromPrompt(line);
      if (path) setCwd(path);
    }
    // Prompt often arrives without trailing newline
    if (noteLineBuf) {
      const path = extractCwdFromPrompt(noteLineBuf);
      if (path) {
        setCwd(path);
        noteLineBuf = "";
      }
    }
  }

  return {
    get phase() {
      return phase;
    },
    isCapturing: () => phase !== "shell",
    toggleCompose,
    enterAndSend,
    tryHandleData,
    consumePtyOutput,
    notePtyOutput,
    dispose() {
      disposed = true;
      abortRender = true;
      clearPromptTimer();
      clearRelayTimers();
      resetRelayFilter();
      noteLineBuf = "";
      pending = [];
      phase = "shell";
    },
  };
}
