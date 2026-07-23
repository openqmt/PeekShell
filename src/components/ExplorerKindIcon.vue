<script setup lang="ts">
/**
 * Explorer tree kind icons.
 * - line: compact outline icons (kindDisplay = icon)
 * - filled: modern colored glyphs (kindDisplay = image)
 */
import { computed } from "vue";
import type { RemoteEntry } from "../types/host";

const props = withDefaults(
  defineProps<{
    entry: Pick<RemoteEntry, "name" | "isDir" | "fileType">;
    variant?: "line" | "filled";
  }>(),
  { variant: "line" }
);

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

const filled = computed(() => props.variant === "filled");
</script>

<template>
  <span class="kind-icon" :class="[kind, variant]" aria-hidden="true">
    <template v-if="filled">
      <!-- filled: modern colored glyphs -->
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

.kind-icon.filled {
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
