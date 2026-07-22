/**
 * Resolve a CodeMirror language extension from a remote filename / path.
 */
import { languages } from "@codemirror/language-data";
import { LanguageDescription } from "@codemirror/language";
import type { Extension } from "@codemirror/state";

/** Match filename (or basename of path) to a language support, if available. */
export async function languageSupportForFilename(filename: string): Promise<Extension> {
  const base = filename.includes("/")
    ? filename.slice(filename.lastIndexOf("/") + 1)
    : filename;
  if (!base) return [];
  const desc = LanguageDescription.matchFilename(languages, base);
  if (!desc) return [];
  try {
    return await desc.load();
  } catch {
    return [];
  }
}
