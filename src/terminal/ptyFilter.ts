/**
 * PTY 输出过滤与 CWD 推断：去掉命令回显 / PS1，并从提示符或 cd 跟踪路径。
 */

/** Strip CSI / OSC sequences for plain-text matching. */
export function stripAnsi(text: string): string {
  return text
    .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, "")
    .replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, "")
    .replace(/\x1b[()][0-9A-Za-z]/g, "")
    .replace(/\x1b./g, "");
}

/** Path segment from a PS1 line (`user@host:path#`), or null if not a prompt. */
export function extractCwdFromPrompt(line: string): string | null {
  const s = stripAnsi(line).replace(/\r/g, "").trim();
  if (!s || s.length > 240) return null;

  const m = s.match(/^[\w.-]+@[\w.-]+:([^#$\n]*)[#\$]\s*$/);
  if (m) {
    const p = (m[1] ?? "").trim();
    return p || "~";
  }

  const m2 = s.match(/^[\w.-]+@[\w.-]+\s+(\S+)\s*[#\$]\s*$/);
  if (m2?.[1]) return m2[1];

  return null;
}

/** True for typical bash/zsh prompts like `user@host:~#` / `user@host:/tmp$`. */
export function looksLikeShellPrompt(line: string): boolean {
  return extractCwdFromPrompt(line) != null;
}

/** True if this line is the shell echoing the command we just sent. */
export function looksLikeCommandEcho(line: string, command: string): boolean {
  const s = stripAnsi(line).replace(/\r/g, "").trim();
  const cmd = command.trim();
  if (!s || !cmd) return false;
  if (s === cmd) return true;
  if (s.endsWith(cmd) && s.length <= cmd.length + 40) return true;
  return false;
}

function normalizePath(path: string): string {
  const home = path === "~" || path.startsWith("~/");
  const abs = path.startsWith("/");
  const raw = path.replace(/^~\//, "").replace(/^~$/, "").replace(/^\//, "");
  const stack: string[] = [];
  for (const part of raw.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") {
      stack.pop();
      continue;
    }
    stack.push(part);
  }
  if (home) return stack.length ? `~/${stack.join("/")}` : "~";
  if (abs) return "/" + stack.join("/");
  return stack.join("/") || ".";
}

function joinCwd(cwd: string, rel: string): string {
  if (rel.startsWith("/")) return normalizePath(rel);
  if (rel === "~" || rel.startsWith("~/")) return normalizePath(rel);
  if (cwd === "~") return normalizePath(`~/${rel}`);
  if (cwd.startsWith("~/") || cwd.startsWith("/")) {
    return normalizePath(`${cwd}/${rel}`);
  }
  return normalizePath(`${cwd}/${rel}`);
}

/**
 * Apply `cd` segments in a shell line (`cd /x && ls`, `cd ..`) onto a tracked cwd.
 * Ignores `cd -` (OLDPWD unknown).
 */
export function applyCdFromCommand(cwd: string, command: string): string {
  let cur = cwd || "~";
  const segments = command.split(/&&|;|\n/).map((s) => s.trim()).filter(Boolean);
  for (const seg of segments) {
    const m = seg.match(/^cd(?:\s+(.+))?$/);
    if (!m) continue;
    let target = (m[1] ?? "").trim();
    if (
      (target.startsWith('"') && target.endsWith('"')) ||
      (target.startsWith("'") && target.endsWith("'"))
    ) {
      target = target.slice(1, -1);
    }
    if (!target || target === "~") {
      cur = "~";
      continue;
    }
    if (target === "-") continue;
    cur = joinCwd(cur, target);
  }
  return cur;
}
