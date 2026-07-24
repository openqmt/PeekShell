/**
 * 行首中/日/韩文字检测：用于 shell 下自动进入终端 AI 对话。
 * 典型 shell 命令名为 ASCII，行首 CJK/假名/韩文几乎不会是合法命令。
 */

function isCjkOrHangulCodePoint(cp: number): boolean {
  // CJK Unified Ideographs + Extension A (covers Chinese / Japanese kanji)
  if ((cp >= 0x4e00 && cp <= 0x9fff) || (cp >= 0x3400 && cp <= 0x4dbf)) return true;
  // Hiragana / Katakana
  if ((cp >= 0x3040 && cp <= 0x309f) || (cp >= 0x30a0 && cp <= 0x30ff)) return true;
  // Hangul syllables + Jamo
  if ((cp >= 0xac00 && cp <= 0xd7af) || (cp >= 0x1100 && cp <= 0x11ff)) return true;
  return false;
}

/** True when the first non-whitespace character is CJK / kana / hangul. */
export function startsWithCjkOrHangul(line: string): boolean {
  const s = line.trimStart();
  if (!s) return false;
  const cp = s.codePointAt(0);
  if (cp == null) return false;
  return isCjkOrHangulCodePoint(cp);
}
