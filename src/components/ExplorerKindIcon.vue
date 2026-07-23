<script setup lang="ts">
/**
 * Explorer tree kind icons.
 * - line: compact outline icons (kindDisplay = icon)
 * - windows: colored glyphs in Windows Explorer style (kindDisplay = windows)
 * - macos: Finder-like folder/document glyphs (kindDisplay = macos)
 */
import { computed, useId } from "vue";
import type { RemoteEntry } from "../types/host";

const props = withDefaults(
  defineProps<{
    entry: Pick<RemoteEntry, "name" | "isDir" | "fileType">;
    variant?: "line" | "windows" | "macos";
  }>(),
  { variant: "line" }
);

/** Unique prefix so gradient defs don’t collide across many tree rows. */
const gid = useId();

type IconKind =
  | "folder"
  | "symlink"
  | "image"
  | "code"
  | "archive"
  | "text"
  | "video"
  | "audio"
  | "pdf"
  | "file";

function isSymlink(entry: Pick<RemoteEntry, "isDir" | "fileType">) {
  const raw = entry.fileType.toLowerCase();
  return raw.includes("link") || raw === "l" || raw === "symlink";
}

function extOf(name: string) {
  const i = name.lastIndexOf(".");
  if (i <= 0 || i === name.length - 1) return "";
  return name.slice(i + 1).toLowerCase();
}

const IMAGE_EXT = new Set([
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "bmp",
  "svg",
  "ico",
  "avif",
  "heic",
]);
const ARCHIVE_EXT = new Set([
  "zip",
  "tar",
  "gz",
  "tgz",
  "bz2",
  "xz",
  "7z",
  "rar",
  "zst",
]);
const CODE_EXT = new Set([
  "js",
  "ts",
  "jsx",
  "tsx",
  "vue",
  "py",
  "rs",
  "go",
  "java",
  "kt",
  "c",
  "h",
  "cpp",
  "hpp",
  "cs",
  "rb",
  "php",
  "swift",
  "sh",
  "bash",
  "zsh",
  "ps1",
  "sql",
  "html",
  "css",
  "scss",
  "less",
  "json",
  "yaml",
  "yml",
  "toml",
  "xml",
  "gradle",
  "cmake",
]);
const TEXT_EXT = new Set([
  "txt",
  "md",
  "markdown",
  "log",
  "csv",
  "tsv",
  "ini",
  "cfg",
  "conf",
  "env",
]);
const VIDEO_EXT = new Set(["mp4", "mkv", "mov", "webm", "avi", "m4v"]);
const AUDIO_EXT = new Set(["mp3", "wav", "flac", "aac", "ogg", "m4a", "wma"]);
const PDF_EXT = new Set(["pdf"]);

const kind = computed<IconKind>(() => {
  if (props.entry.isDir) return "folder";
  if (isSymlink(props.entry)) return "symlink";
  const ext = extOf(props.entry.name);
  if (IMAGE_EXT.has(ext)) return "image";
  if (VIDEO_EXT.has(ext)) return "video";
  if (AUDIO_EXT.has(ext)) return "audio";
  if (PDF_EXT.has(ext)) return "pdf";
  if (ARCHIVE_EXT.has(ext)) return "archive";
  if (CODE_EXT.has(ext)) return "code";
  if (TEXT_EXT.has(ext)) return "text";
  return "file";
});

const isWindows = computed(() => props.variant === "windows");
const isMacos = computed(() => props.variant === "macos");
</script>

<template>
  <span class="kind-icon" :class="[kind, variant]" aria-hidden="true">
    <template v-if="isWindows">
      <!-- windows: colored Explorer-style glyphs -->
      <svg v-if="kind === 'folder'" viewBox="0 0 16 16">
        <path
          d="M1.75 4.1A1.6 1.6 0 0 1 3.35 2.5h2.55c.35 0 .68.14.92.4l.55.6c.12.13.29.2.46.2h4.82A1.6 1.6 0 0 1 14.25 5.3v6.45a1.6 1.6 0 0 1-1.6 1.6H3.35a1.6 1.6 0 0 1-1.6-1.6V4.1Z"
          fill="#F5B942"
        />
        <path
          d="M1.75 6.4h12.5v5.35a1.6 1.6 0 0 1-1.6 1.6H3.35a1.6 1.6 0 0 1-1.6-1.6V6.4Z"
          fill="#E8A317"
        />
      </svg>

      <svg v-else-if="kind === 'symlink'" viewBox="0 0 16 16">
        <rect x="1.5" y="1.5" width="13" height="13" rx="3" fill="#94A3B8" />
        <path
          d="M6.2 9.8 4.4 8l1.8-1.8M9.8 6.2 11.6 8l-1.8 1.8M7.1 8.9l1.8-1.8"
          stroke="#fff"
          stroke-width="1.35"
          stroke-linecap="round"
          stroke-linejoin="round"
          fill="none"
        />
      </svg>

      <svg v-else-if="kind === 'image'" viewBox="0 0 16 16">
        <rect x="1.5" y="1.5" width="13" height="13" rx="3" fill="#38BDF8" />
        <circle cx="5.6" cy="5.8" r="1.35" fill="#fff" />
        <path
          d="m3.2 12.2 2.7-3.1a1 1 0 0 1 1.5-.05l1.5 1.55.9-.95a1 1 0 0 1 1.45 0L13 12.2"
          fill="#0284C7"
        />
      </svg>

      <svg v-else-if="kind === 'code'" viewBox="0 0 16 16">
        <rect x="1.5" y="1.5" width="13" height="13" rx="3" fill="#34D399" />
        <path
          d="M6.1 4.8 3.6 8l2.5 3.2M9.9 4.8 12.4 8l-2.5 3.2M8.7 4.4 7.3 11.6"
          stroke="#064E3B"
          stroke-width="1.35"
          stroke-linecap="round"
          stroke-linejoin="round"
          fill="none"
        />
      </svg>

      <svg v-else-if="kind === 'archive'" viewBox="0 0 16 16">
        <path
          d="M3 3.2h10v1.6H3V3.2Zm.4 1.6h9.2v8a1.4 1.4 0 0 1-1.4 1.4H4.8a1.4 1.4 0 0 1-1.4-1.4v-8Z"
          fill="#F59E0B"
        />
        <path d="M7.1 5.5h1.8v1.3H7.1V5.5Zm0 2.2h1.8v1.3H7.1V7.7Zm0 2.2h1.8v1.6H7.1v-1.6Z" fill="#78350F" />
      </svg>

      <svg v-else-if="kind === 'text'" viewBox="0 0 16 16">
        <path
          d="M3.2 1.8h6.1L12.8 5.3v8.1a1.2 1.2 0 0 1-1.2 1.2H3.2A1.2 1.2 0 0 1 2 13.4V3a1.2 1.2 0 0 1 1.2-1.2Z"
          fill="#64748B"
        />
        <path d="M9.2 1.9V5h3.4" fill="#94A3B8" />
        <path d="M4.6 8.2h6.4M4.6 10.2h4.8" stroke="#E2E8F0" stroke-width="1.2" stroke-linecap="round" />
      </svg>

      <svg v-else-if="kind === 'video'" viewBox="0 0 16 16">
        <rect x="1.5" y="1.5" width="13" height="13" rx="3" fill="#A78BFA" />
        <path d="M6.2 5.1v5.8L11.2 8 6.2 5.1Z" fill="#fff" />
      </svg>

      <svg v-else-if="kind === 'audio'" viewBox="0 0 16 16">
        <rect x="1.5" y="1.5" width="13" height="13" rx="3" fill="#F472B6" />
        <path
          d="M6.2 10.6a1.5 1.5 0 1 1-1.1-1.45V5.3l5.2-1.1v5.55a1.5 1.5 0 1 1-1.1-1.45V6.1L6.2 6.7v3.9Z"
          fill="#fff"
        />
      </svg>

      <svg v-else-if="kind === 'pdf'" viewBox="0 0 16 16">
        <path
          d="M3.2 1.8h6.1L12.8 5.3v8.1a1.2 1.2 0 0 1-1.2 1.2H3.2A1.2 1.2 0 0 1 2 13.4V3a1.2 1.2 0 0 1 1.2-1.2Z"
          fill="#EF4444"
        />
        <path d="M9.2 1.9V5h3.4" fill="#FCA5A5" />
        <path
          d="M4.4 9.9h2.1c.9 0 1.5-.5 1.5-1.25S7.4 7.4 6.5 7.4H5.3v4.4H4.4V9.9Zm.9-.75h1.1c.35 0 .6.2.6.5s-.25.5-.6.5H5.3V9.15Zm3.2 2.65c1.05 0 1.7-.7 1.7-1.85S9.55 8.1 8.5 8.1 6.8 8.8 6.8 9.95s.65 1.85 1.7 1.85Zm0-.8c-.5 0-.8-.4-.8-1.05s.3-1.05.8-1.05.8.4.8 1.05-.3 1.05-.8 1.05Zm2.55.8h.9V9.9h1.35V9.15H12.05V8.1h-.9v3.7Z"
          fill="#fff"
        />
      </svg>

      <svg v-else viewBox="0 0 16 16">
        <path
          d="M3.2 1.8h6.1L12.8 5.3v8.1a1.2 1.2 0 0 1-1.2 1.2H3.2A1.2 1.2 0 0 1 2 13.4V3a1.2 1.2 0 0 1 1.2-1.2Z"
          fill="#60A5FA"
        />
        <path d="M9.2 1.9V5h3.4" fill="#93C5FD" />
      </svg>
    </template>

    <template v-else-if="isMacos">
      <!-- macos: Finder-like folder / document glyphs -->
      <svg v-if="kind === 'folder'" viewBox="0 0 16 16">
        <defs>
          <linearGradient :id="`${gid}-folderBody`" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#7DD3FC" />
            <stop offset="55%" stop-color="#38BDF8" />
            <stop offset="100%" stop-color="#0EA5E9" />
          </linearGradient>
          <linearGradient :id="`${gid}-folderTab`" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#BAE6FD" />
            <stop offset="100%" stop-color="#7DD3FC" />
          </linearGradient>
        </defs>
        <path
          d="M1.6 4.35c0-.75.6-1.35 1.35-1.35h3.05c.32 0 .62.12.85.34l.7.68c.14.14.33.22.53.22h5.0c.75 0 1.35.6 1.35 1.35v.55H1.6v-1.79Z"
          :fill="`url(#${gid}-folderTab)`"
        />
        <path
          d="M1.6 5.55h12.8v6.55c0 .9-.73 1.65-1.65 1.65H3.25c-.9 0-1.65-.75-1.65-1.65V5.55Z"
          :fill="`url(#${gid}-folderBody)`"
        />
        <path
          d="M1.6 6.7h12.8"
          stroke="#FFFFFF"
          stroke-opacity="0.35"
          stroke-width="0.9"
        />
      </svg>

      <svg v-else-if="kind === 'symlink'" viewBox="0 0 16 16">
        <defs>
          <linearGradient :id="`${gid}-alias`" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#E2E8F0" />
            <stop offset="100%" stop-color="#94A3B8" />
          </linearGradient>
        </defs>
        <path
          d="M3.1 1.7h6.2L13 5.4v7.5c0 .7-.55 1.25-1.25 1.25H3.1c-.7 0-1.25-.55-1.25-1.25V2.95c0-.7.55-1.25 1.25-1.25Z"
          :fill="`url(#${gid}-alias)`"
        />
        <path d="M9.2 1.85V5.2h3.35" fill="#CBD5E1" />
        <circle cx="11.2" cy="11.2" r="2.55" fill="#0EA5E9" />
        <path
          d="M10.35 11.2h1.7M11.2 10.35v1.7"
          stroke="#fff"
          stroke-width="1.15"
          stroke-linecap="round"
        />
      </svg>

      <svg v-else-if="kind === 'image'" viewBox="0 0 16 16">
        <defs>
          <linearGradient :id="`${gid}-img`" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stop-color="#FDE68A" />
            <stop offset="45%" stop-color="#F9A8D4" />
            <stop offset="100%" stop-color="#93C5FD" />
          </linearGradient>
        </defs>
        <rect x="1.6" y="1.6" width="12.8" height="12.8" rx="2.6" :fill="`url(#${gid}-img)`" />
        <circle cx="5.5" cy="5.7" r="1.35" fill="#fff" fill-opacity="0.9" />
        <path
          d="m2.8 12.4 2.9-3.2a1 1 0 0 1 1.5-.05l1.35 1.4.85-.9a1 1 0 0 1 1.45 0L13.2 12.4"
          fill="#fff"
          fill-opacity="0.88"
        />
      </svg>

      <svg v-else-if="kind === 'code'" viewBox="0 0 16 16">
        <path
          d="M3.1 1.7h6.2L13 5.4v7.5c0 .7-.55 1.25-1.25 1.25H3.1c-.7 0-1.25-.55-1.25-1.25V2.95c0-.7.55-1.25 1.25-1.25Z"
          fill="#F8FAFC"
        />
        <path d="M9.2 1.85V5.2h3.35" fill="#E2E8F0" />
        <path d="M3.1 1.7h6.2L13 5.4v7.5c0 .7-.55 1.25-1.25 1.25H3.1c-.7 0-1.25-.55-1.25-1.25V2.95c0-.7.55-1.25 1.25-1.25Z" fill="none" stroke="#CBD5E1" stroke-width="0.7" />
        <path
          d="M5.8 6.4 4 8l1.8 1.6M10.2 6.4 12 8l-1.8 1.6M8.7 6.1 7.3 10.1"
          stroke="#22C55E"
          stroke-width="1.2"
          stroke-linecap="round"
          stroke-linejoin="round"
          fill="none"
        />
      </svg>

      <svg v-else-if="kind === 'archive'" viewBox="0 0 16 16">
        <defs>
          <linearGradient :id="`${gid}-zip`" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#FDE68A" />
            <stop offset="100%" stop-color="#F59E0B" />
          </linearGradient>
        </defs>
        <path
          d="M3.1 1.7h6.2L13 5.4v7.5c0 .7-.55 1.25-1.25 1.25H3.1c-.7 0-1.25-.55-1.25-1.25V2.95c0-.7.55-1.25 1.25-1.25Z"
          :fill="`url(#${gid}-zip)`"
        />
        <path d="M9.2 1.85V5.2h3.35" fill="#FCD34D" />
        <path d="M7.1 3.4h1.8v1.1H7.1V3.4Zm0 1.7h1.8v1.1H7.1V5.1Zm0 1.7h1.8v1.1H7.1V6.8Zm0 1.7h1.8v1.1H7.1V8.5Z" fill="#92400E" fill-opacity="0.55" />
        <rect x="6.55" y="10.2" width="2.9" height="2.2" rx="0.45" fill="#78350F" />
      </svg>

      <svg v-else-if="kind === 'text'" viewBox="0 0 16 16">
        <path
          d="M3.1 1.7h6.2L13 5.4v7.5c0 .7-.55 1.25-1.25 1.25H3.1c-.7 0-1.25-.55-1.25-1.25V2.95c0-.7.55-1.25 1.25-1.25Z"
          fill="#F8FAFC"
        />
        <path d="M9.2 1.85V5.2h3.35" fill="#E2E8F0" />
        <path d="M3.1 1.7h6.2L13 5.4v7.5c0 .7-.55 1.25-1.25 1.25H3.1c-.7 0-1.25-.55-1.25-1.25V2.95c0-.7.55-1.25 1.25-1.25Z" fill="none" stroke="#CBD5E1" stroke-width="0.7" />
        <path d="M4.6 7.6h6.4M4.6 9.5h5.2M4.6 11.4h4" stroke="#64748B" stroke-width="1.05" stroke-linecap="round" />
      </svg>

      <svg v-else-if="kind === 'video'" viewBox="0 0 16 16">
        <defs>
          <linearGradient :id="`${gid}-vid`" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#C4B5FD" />
            <stop offset="100%" stop-color="#7C3AED" />
          </linearGradient>
        </defs>
        <rect x="1.6" y="1.6" width="12.8" height="12.8" rx="2.6" :fill="`url(#${gid}-vid)`" />
        <path d="M6.1 5.2v5.6L11.1 8 6.1 5.2Z" fill="#fff" />
      </svg>

      <svg v-else-if="kind === 'audio'" viewBox="0 0 16 16">
        <defs>
          <linearGradient :id="`${gid}-aud`" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#F9A8D4" />
            <stop offset="100%" stop-color="#DB2777" />
          </linearGradient>
        </defs>
        <rect x="1.6" y="1.6" width="12.8" height="12.8" rx="2.6" :fill="`url(#${gid}-aud)`" />
        <path
          d="M6.1 10.55a1.45 1.45 0 1 1-1.05-1.4V5.35l5.1-1.05v5.4a1.45 1.45 0 1 1-1.05-1.4V6.15L6.1 6.7v3.85Z"
          fill="#fff"
        />
      </svg>

      <svg v-else-if="kind === 'pdf'" viewBox="0 0 16 16">
        <path
          d="M3.1 1.7h6.2L13 5.4v7.5c0 .7-.55 1.25-1.25 1.25H3.1c-.7 0-1.25-.55-1.25-1.25V2.95c0-.7.55-1.25 1.25-1.25Z"
          fill="#F8FAFC"
        />
        <path d="M9.2 1.85V5.2h3.35" fill="#FEE2E2" />
        <path d="M3.1 1.7h6.2L13 5.4v7.5c0 .7-.55 1.25-1.25 1.25H3.1c-.7 0-1.25-.55-1.25-1.25V2.95c0-.7.55-1.25 1.25-1.25Z" fill="none" stroke="#FECACA" stroke-width="0.7" />
        <rect x="3.4" y="9.5" width="9.2" height="3.2" rx="0.7" fill="#EF4444" />
        <path d="M4.55 11.75V10.25h1.05c.55 0 .9.3.9.75s-.35.75-.9.75H4.55Zm.7-.55h.35c.2 0 .35-.1.35-.25s-.15-.2-.35-.2H5.25v.45Zm1.85.55V10.25h.7c.7 0 1.15.4 1.15.75 0 .35-.45.75-1.15.75h-.7Zm.7-.55h.05c.3 0 .45-.15.45-.25s-.15-.2-.45-.2h-.05v.45Zm1.85.55V10.25h1.85v.5h-1.15v.25h1v.5h-1v.25h1.2v.5H8.6Z" fill="#fff" />
      </svg>

      <svg v-else viewBox="0 0 16 16">
        <defs>
          <linearGradient :id="`${gid}-doc`" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#FFFFFF" />
            <stop offset="100%" stop-color="#F1F5F9" />
          </linearGradient>
        </defs>
        <path
          d="M3.1 1.7h6.2L13 5.4v7.5c0 .7-.55 1.25-1.25 1.25H3.1c-.7 0-1.25-.55-1.25-1.25V2.95c0-.7.55-1.25 1.25-1.25Z"
          :fill="`url(#${gid}-doc)`"
        />
        <path d="M9.2 1.85V5.2h3.35" fill="#E2E8F0" />
        <path
          d="M3.1 1.7h6.2L13 5.4v7.5c0 .7-.55 1.25-1.25 1.25H3.1c-.7 0-1.25-.55-1.25-1.25V2.95c0-.7.55-1.25 1.25-1.25Z"
          fill="none"
          stroke="#CBD5E1"
          stroke-width="0.7"
        />
        <path d="M4.6 8h6.4M4.6 10h4.8" stroke="#94A3B8" stroke-width="1.05" stroke-linecap="round" />
      </svg>
    </template>

    <template v-else>
      <!-- line: compact outline icons -->
      <svg v-if="kind === 'folder'" viewBox="0 0 16 16" fill="none">
        <path
          d="M2.5 4.25A1.75 1.75 0 0 1 4.25 2.5h2.1c.4 0 .78.17 1.05.46l.7.76c.14.15.33.24.53.24h3.12A1.75 1.75 0 0 1 13.5 5.7v6.05A1.75 1.75 0 0 1 11.75 13.5h-7.5A1.75 1.75 0 0 1 2.5 11.75V4.25Z"
          stroke="currentColor"
          stroke-width="1.35"
          stroke-linejoin="round"
        />
      </svg>
      <svg v-else-if="kind === 'symlink'" viewBox="0 0 16 16" fill="none">
        <path d="M9.5 3.5h3v3" stroke="currentColor" stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round" />
        <path
          d="M12.5 3.5 8.2 7.8a2.4 2.4 0 0 0 0 3.4l.1.1"
          stroke="currentColor"
          stroke-width="1.35"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
        <path d="M6.5 12.5h-3v-3" stroke="currentColor" stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round" />
        <path
          d="M3.5 12.5 7.8 8.2a2.4 2.4 0 0 0 0-3.4l-.1-.1"
          stroke="currentColor"
          stroke-width="1.35"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      </svg>
      <svg v-else-if="kind === 'image'" viewBox="0 0 16 16" fill="none">
        <rect x="2.5" y="3.5" width="11" height="9" rx="1.5" stroke="currentColor" stroke-width="1.35" />
        <circle cx="5.75" cy="6.5" r="1.1" fill="currentColor" />
        <path
          d="m5 11 2.2-2.4a1 1 0 0 1 1.45-.05L10 10l.7-.7a1 1 0 0 1 1.35 0L13.5 11"
          stroke="currentColor"
          stroke-width="1.35"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      </svg>
      <svg v-else-if="kind === 'code'" viewBox="0 0 16 16" fill="none">
        <path d="M5.5 4.5 2.5 8l3 3.5" stroke="currentColor" stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round" />
        <path d="m10.5 4.5 3 3.5-3 3.5" stroke="currentColor" stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round" />
        <path d="m9 3.5-2 9" stroke="currentColor" stroke-width="1.35" stroke-linecap="round" />
      </svg>
      <svg v-else-if="kind === 'archive'" viewBox="0 0 16 16" fill="none">
        <path
          d="M3.5 4.5h9v8.25a1.25 1.25 0 0 1-1.25 1.25h-6.5A1.25 1.25 0 0 1 3.5 12.75V4.5Z"
          stroke="currentColor"
          stroke-width="1.35"
          stroke-linejoin="round"
        />
        <path d="M3.5 4.5 5 2.5h6l1.5 2" stroke="currentColor" stroke-width="1.35" stroke-linejoin="round" />
        <path d="M7 6.5h2M7 8.5h2M7 10.5h2" stroke="currentColor" stroke-width="1.35" stroke-linecap="round" />
      </svg>
      <svg v-else-if="kind === 'text'" viewBox="0 0 16 16" fill="none">
        <path
          d="M4 2.75h5.2L12.5 6v7.25a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V3.75a1 1 0 0 1 1-1Z"
          stroke="currentColor"
          stroke-width="1.35"
          stroke-linejoin="round"
        />
        <path d="M9 2.75V6h3.3" stroke="currentColor" stroke-width="1.35" stroke-linejoin="round" />
        <path d="M5.5 9h5M5.5 11.25h3.5" stroke="currentColor" stroke-width="1.35" stroke-linecap="round" />
      </svg>
      <svg v-else-if="kind === 'video'" viewBox="0 0 16 16" fill="none">
        <rect x="2.5" y="3.5" width="11" height="9" rx="1.5" stroke="currentColor" stroke-width="1.35" />
        <path d="M6.8 6v4l3.5-2-3.5-2Z" fill="currentColor" />
      </svg>
      <svg v-else-if="kind === 'audio'" viewBox="0 0 16 16" fill="none">
        <path
          d="M6.5 11.2a1.4 1.4 0 1 1-1-1.35V5.2l5-1v5.2a1.4 1.4 0 1 1-1-1.35V6.1l-3 .65v4.45Z"
          stroke="currentColor"
          stroke-width="1.35"
          stroke-linejoin="round"
        />
      </svg>
      <svg v-else-if="kind === 'pdf'" viewBox="0 0 16 16" fill="none">
        <path
          d="M4 2.75h5.2L12.5 6v7.25a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V3.75a1 1 0 0 1 1-1Z"
          stroke="currentColor"
          stroke-width="1.35"
          stroke-linejoin="round"
        />
        <path d="M9 2.75V6h3.3" stroke="currentColor" stroke-width="1.35" stroke-linejoin="round" />
        <path d="M5.2 10.2h5.2" stroke="currentColor" stroke-width="1.35" stroke-linecap="round" />
      </svg>
      <svg v-else viewBox="0 0 16 16" fill="none">
        <path
          d="M4 2.75h5.2L12.5 6v7.25a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V3.75a1 1 0 0 1 1-1Z"
          stroke="currentColor"
          stroke-width="1.35"
          stroke-linejoin="round"
        />
        <path d="M9 2.75V6h3.3" stroke="currentColor" stroke-width="1.35" stroke-linejoin="round" />
      </svg>
    </template>
  </span>
</template>

<style scoped>
.kind-icon {
  flex-shrink: 0;
  display: inline-flex;
  width: 14px;
  height: 14px;
  margin-right: 4px;
  color: var(--text-dim);
}

.kind-icon.windows,
.kind-icon.macos {
  width: 16px;
  height: 16px;
  margin-right: 5px;
}

.kind-icon :deep(svg) {
  width: 100%;
  height: 100%;
  display: block;
}

.kind-icon.line.folder {
  color: var(--accent);
}

.kind-icon.line.symlink {
  color: var(--text-muted);
}

.kind-icon.line.image {
  color: #5b9fd4;
}

.kind-icon.line.code {
  color: #7bc47f;
}

.kind-icon.line.archive {
  color: #c9a227;
}

.kind-icon.line.text {
  color: var(--text-muted);
}

.kind-icon.line.video {
  color: #9b8afb;
}

.kind-icon.line.audio {
  color: #e879b8;
}

.kind-icon.line.pdf {
  color: #e85d5d;
}
</style>
