/**
 * 判断一行输入是否更像 shell 命令（AI 模式下应直接交给远端 PTY）。
 * 启发式：路径前缀、管道重定向、常见命令名；中日韩开头不当作命令。
 */
import { startsWithCjkOrHangul } from "./cjk";

/** Common Unix builtins / tools — first token match → shell. */
const SHELL_COMMANDS = new Set([
  "alias",
  "apt",
  "apt-get",
  "awk",
  "bash",
  "bg",
  "cat",
  "cd",
  "chmod",
  "chown",
  "clear",
  "cp",
  "curl",
  "df",
  "diff",
  "dig",
  "dmesg",
  "docker",
  "du",
  "echo",
  "env",
  "export",
  "fg",
  "find",
  "free",
  "git",
  "grep",
  "head",
  "history",
  "htop",
  "ifconfig",
  "ip",
  "jobs",
  "journalctl",
  "kill",
  "killall",
  "kubectl",
  "less",
  "ln",
  "ls",
  "lsof",
  "man",
  "mkdir",
  "mount",
  "mv",
  "nano",
  "netstat",
  "nice",
  "nohup",
  "npm",
  "nvim",
  "openssl",
  "passwd",
  "ping",
  "pkg",
  "ps",
  "pwd",
  "python",
  "python3",
  "rg",
  "rm",
  "rmdir",
  "rsync",
  "scp",
  "sed",
  "service",
  "set",
  "sh",
  "sleep",
  "sort",
  "source",
  "ssh",
  "stat",
  "sudo",
  "systemctl",
  "tail",
  "tar",
  "tee",
  "time",
  "top",
  "touch",
  "traceroute",
  "tree",
  "type",
  "umount",
  "uname",
  "unset",
  "unzip",
  "uptime",
  "vi",
  "vim",
  "wc",
  "wget",
  "which",
  "whoami",
  "xargs",
  "yum",
  "zcat",
  "zip",
  "zsh",
]);

const SHELL_META = /(?:\|\||&&|\||>>|<<|[<>;]|\d>&|\d>&1)/;

function firstToken(line: string): string {
  const s = line.trimStart();
  if (!s) return "";
  // Strip leading env assignments: FOO=1 BAR=2 ls
  let rest = s;
  while (/^[A-Za-z_][A-Za-z0-9_]*=\S+\s+/.test(rest)) {
    rest = rest.replace(/^[A-Za-z_][A-Za-z0-9_]*=\S+\s+/, "");
  }
  const m = rest.match(/^([^\s]+)/);
  return m?.[1] ?? "";
}

function baseCommandName(token: string): string {
  // sudo -u root ls  → handled by walking; here strip path: /usr/bin/ls → ls
  const base = token.includes("/") ? token.slice(token.lastIndexOf("/") + 1) : token;
  return base.toLowerCase();
}

/** True when compose-mode Enter should run on the remote shell instead of AI. */
export function looksLikeShellCommand(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return false;
  if (startsWithCjkOrHangul(trimmed)) return false;

  const s = trimmed.trimStart();
  // Paths / expansions / subshells
  if (
    s.startsWith("./") ||
    s.startsWith("../") ||
    s.startsWith("~/") ||
    s.startsWith("/") ||
    s.startsWith("$") ||
    s.startsWith("`") ||
    s.startsWith("(") ||
    s.startsWith("{")
  ) {
    return true;
  }

  if (SHELL_META.test(s)) return true;

  let token = firstToken(s);
  if (!token) return false;

  // Unwrap sudo / doas / time / nice / nohup / command / env / busybox
  const wrappers = new Set([
    "sudo",
    "doas",
    "time",
    "nice",
    "nohup",
    "command",
    "env",
    "busybox",
  ]);
  const parts = s.split(/\s+/);
  let i = 0;
  while (i < parts.length) {
    const p = parts[i]!;
    if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(p)) {
      i++;
      continue;
    }
    const name = baseCommandName(p);
    if (wrappers.has(name)) {
      // skip sudo flags like -u user
      i++;
      while (i < parts.length && parts[i]!.startsWith("-")) {
        // -u root takes a value
        if (/^-[a-zA-Z]*[upCg]$/.test(parts[i]!) || parts[i] === "--user") {
          i += 2;
        } else {
          i++;
        }
      }
      continue;
    }
    token = p;
    break;
  }

  const name = baseCommandName(token);
  if (SHELL_COMMANDS.has(name)) return true;

  // Executable-looking: foo.sh, foo.py, binary with extension
  if (/\.(sh|bash|py|pl|rb|js|out|bin)$/i.test(name)) return true;

  return false;
}
