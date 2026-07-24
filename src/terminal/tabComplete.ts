/**
 * AI> 行内 Tab 补全：用 listRemoteDir 按当前 cwd 匹配文件/目录名。
 */

export interface CompletionEntry {
  name: string;
  isDir: boolean;
}

export interface CompletionContext {
  /** Absolute or ~/… directory to list. */
  listPath: string;
  /** Name prefix to match inside listPath. */
  prefix: string;
  /** Index in `line` where the token being completed starts. */
  tokenStart: number;
  /** Only directories (for `cd`). */
  dirsOnly: boolean;
}

function joinPath(base: string, rel: string): string {
  if (!rel) return base;
  if (rel.startsWith("/") || rel === "~" || rel.startsWith("~/")) return rel;
  if (base === "/" ) return `/${rel}`;
  if (base === "~") return `~/${rel}`;
  return `${base.replace(/\/$/, "")}/${rel}`;
}

/** Split open token at end of line (no closed quotes handling beyond simple cases). */
export function parseCompletionContext(
  line: string,
  cwd: string
): CompletionContext | null {
  // Don't complete empty line
  if (!line.trim()) return null;

  const tokenStart = line.lastIndexOf(" ") + 1;
  const token = line.slice(tokenStart);
  const before = line.slice(0, tokenStart).trimEnd();
  const first = before.split(/\s+/)[0]?.toLowerCase() ?? "";
  const dirsOnly = first === "cd";

  // Completing the command name itself — skip (no PATH listing here)
  if (!before && !token.includes("/") && !token.startsWith("~")) {
    return null;
  }

  let listPath: string;
  let prefix: string;

  if (token.startsWith("/") || token.startsWith("~/") || token === "~") {
    if (token === "~" || token === "~/") {
      listPath = "~";
      prefix = "";
    } else if (token.endsWith("/")) {
      listPath = token.replace(/\/$/, "") || "/";
      prefix = "";
    } else {
      const i = token.lastIndexOf("/");
      listPath = i === 0 ? "/" : token.slice(0, i);
      prefix = token.slice(i + 1);
    }
  } else if (token.includes("/")) {
    if (token.endsWith("/")) {
      listPath = joinPath(cwd, token.replace(/\/$/, ""));
      prefix = "";
    } else {
      const i = token.lastIndexOf("/");
      listPath = joinPath(cwd, token.slice(0, i));
      prefix = token.slice(i + 1);
    }
  } else {
    listPath = cwd || "~";
    prefix = token;
  }

  return { listPath, prefix, tokenStart, dirsOnly };
}

export function longestCommonPrefix(names: string[]): string {
  if (!names.length) return "";
  let p = names[0]!;
  for (let i = 1; i < names.length; i++) {
    const s = names[i]!;
    let j = 0;
    while (j < p.length && j < s.length && p[j] === s[j]) j++;
    p = p.slice(0, j);
    if (!p) break;
  }
  return p;
}

export function filterCompletions(
  entries: CompletionEntry[],
  prefix: string,
  dirsOnly: boolean
): CompletionEntry[] {
  return entries
    .filter((e) => {
      if (dirsOnly && !e.isDir) return false;
      if (e.name === "." || e.name === "..") return false;
      return e.name.startsWith(prefix);
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}
