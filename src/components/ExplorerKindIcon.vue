<script setup lang="ts">
/**
 * Compact SVG icons for remote explorer tree kind column.
 * Categories: folder, symlink, image, code, archive, text, generic file.
 */
import { computed } from "vue";
import type { RemoteEntry } from "../types/host";

const props = defineProps<{
  entry: Pick<RemoteEntry, "name" | "isDir" | "fileType">;
}>();

type IconKind = "folder" | "symlink" | "image" | "code" | "archive" | "text" | "file";

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

const kind = computed<IconKind>(() => {
  if (props.entry.isDir) return "folder";
  if (isSymlink(props.entry)) return "symlink";
  const ext = extOf(props.entry.name);
  if (IMAGE_EXT.has(ext)) return "image";
  if (ARCHIVE_EXT.has(ext)) return "archive";
  if (CODE_EXT.has(ext)) return "code";
  if (TEXT_EXT.has(ext)) return "text";
  return "file";
});
</script>

<template>
  <span class="kind-icon" :class="kind" aria-hidden="true">
    <!-- folder -->
    <svg v-if="kind === 'folder'" viewBox="0 0 16 16" fill="none">
      <path
        d="M2.5 4.25A1.75 1.75 0 0 1 4.25 2.5h2.1c.4 0 .78.17 1.05.46l.7.76c.14.15.33.24.53.24h3.12A1.75 1.75 0 0 1 13.5 5.7v6.05A1.75 1.75 0 0 1 11.75 13.5h-7.5A1.75 1.75 0 0 1 2.5 11.75V4.25Z"
        stroke="currentColor"
        stroke-width="1.35"
        stroke-linejoin="round"
      />
    </svg>
    <!-- symlink -->
    <svg v-else-if="kind === 'symlink'" viewBox="0 0 16 16" fill="none">
      <path
        d="M9.5 3.5h3v3"
        stroke="currentColor"
        stroke-width="1.35"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
      <path
        d="M12.5 3.5 8.2 7.8a2.4 2.4 0 0 0 0 3.4l.1.1"
        stroke="currentColor"
        stroke-width="1.35"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
      <path
        d="M6.5 12.5h-3v-3"
        stroke="currentColor"
        stroke-width="1.35"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
      <path
        d="M3.5 12.5 7.8 8.2a2.4 2.4 0 0 0 0-3.4l-.1-.1"
        stroke="currentColor"
        stroke-width="1.35"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>
    <!-- image -->
    <svg v-else-if="kind === 'image'" viewBox="0 0 16 16" fill="none">
      <rect
        x="2.5"
        y="3.5"
        width="11"
        height="9"
        rx="1.5"
        stroke="currentColor"
        stroke-width="1.35"
      />
      <circle cx="5.75" cy="6.5" r="1.1" fill="currentColor" />
      <path
        d="m5 11 2.2-2.4a1 1 0 0 1 1.45-.05L10 10l.7-.7a1 1 0 0 1 1.35 0L13.5 11"
        stroke="currentColor"
        stroke-width="1.35"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>
    <!-- code -->
    <svg v-else-if="kind === 'code'" viewBox="0 0 16 16" fill="none">
      <path
        d="M5.5 4.5 2.5 8l3 3.5"
        stroke="currentColor"
        stroke-width="1.35"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
      <path
        d="m10.5 4.5 3 3.5-3 3.5"
        stroke="currentColor"
        stroke-width="1.35"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
      <path
        d="m9 3.5-2 9"
        stroke="currentColor"
        stroke-width="1.35"
        stroke-linecap="round"
      />
    </svg>
    <!-- archive -->
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
    <!-- text -->
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
    <!-- generic file -->
    <svg v-else viewBox="0 0 16 16" fill="none">
      <path
        d="M4 2.75h5.2L12.5 6v7.25a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V3.75a1 1 0 0 1 1-1Z"
        stroke="currentColor"
        stroke-width="1.35"
        stroke-linejoin="round"
      />
      <path d="M9 2.75V6h3.3" stroke="currentColor" stroke-width="1.35" stroke-linejoin="round" />
    </svg>
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

.kind-icon :deep(svg) {
  width: 100%;
  height: 100%;
  display: block;
}

.kind-icon.folder {
  color: var(--accent);
}

.kind-icon.symlink {
  color: var(--text-muted);
}

.kind-icon.image {
  color: #5b9fd4;
}

.kind-icon.code {
  color: #7bc47f;
}

.kind-icon.archive {
  color: #c9a227;
}

.kind-icon.text {
  color: var(--text-muted);
}
</style>
