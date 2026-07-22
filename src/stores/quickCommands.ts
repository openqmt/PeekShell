/**
 * 快捷命令：分组、增删改、本地持久化。
 */
import { defineStore } from "pinia";
import { computed, ref, watch } from "vue";
import { UNGROUPED_GROUP } from "../i18n/messages";
import type { QuickCommand, QuickCommandsState } from "../types/quickCommand";

const STORAGE_KEY = "peekshell.quickCommands";

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `cmd-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function normalizeGroup(group: string | undefined | null): string {
  const trimmed = (group ?? "").trim();
  return trimmed || UNGROUPED_GROUP;
}

function readStored(): QuickCommandsState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return { groups: [UNGROUPED_GROUP], commands: [] };
    }
    const parsed = JSON.parse(raw) as Partial<QuickCommandsState>;
    const commands = Array.isArray(parsed.commands)
      ? parsed.commands
          .filter(
            (c): c is QuickCommand =>
              !!c &&
              typeof c.id === "string" &&
              typeof c.name === "string" &&
              typeof c.command === "string"
          )
          .map((c) => ({
            id: c.id,
            name: c.name,
            command: c.command,
            group: normalizeGroup(c.group),
          }))
      : [];
    const groupSet = new Set<string>([UNGROUPED_GROUP]);
    if (Array.isArray(parsed.groups)) {
      for (const g of parsed.groups) {
        if (typeof g === "string" && g.trim()) groupSet.add(normalizeGroup(g));
      }
    }
    for (const c of commands) groupSet.add(c.group);
    return { groups: [...groupSet], commands };
  } catch {
    return { groups: [UNGROUPED_GROUP], commands: [] };
  }
}

export const useQuickCommandsStore = defineStore("quickCommands", () => {
  const initial = readStored();
  const commands = ref<QuickCommand[]>(initial.commands);
  const groups = ref<string[]>(initial.groups);

  watch(
    [commands, groups],
    () => {
      const payload: QuickCommandsState = {
        groups: groups.value,
        commands: commands.value,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    },
    { deep: true }
  );

  const grouped = computed(() => {
    const map = new Map<string, QuickCommand[]>();
    for (const g of groups.value) map.set(g, []);
    for (const cmd of commands.value) {
      const g = normalizeGroup(cmd.group);
      if (!map.has(g)) map.set(g, []);
      map.get(g)!.push(cmd);
    }
    return [...map.entries()];
  });

  function ensureGroup(group?: string | null) {
    const g = normalizeGroup(group);
    if (!groups.value.includes(g)) {
      groups.value = [...groups.value, g];
    }
    return g;
  }

  function addGroup(name: string) {
    const g = normalizeGroup(name);
    if (groups.value.includes(g)) return g;
    groups.value = [...groups.value, g];
    return g;
  }

  function renameGroup(from: string, to: string) {
    const next = normalizeGroup(to);
    if (from === next) return;
    if (!groups.value.includes(from)) return;
    ensureGroup(next);
    commands.value = commands.value.map((c) =>
      c.group === from ? { ...c, group: next } : c
    );
    groups.value = groups.value
      .map((g) => (g === from ? next : g))
      .filter((g, i, arr) => arr.indexOf(g) === i);
    if (from !== UNGROUPED_GROUP && !commands.value.some((c) => c.group === from)) {
      groups.value = groups.value.filter((g) => g !== from);
    }
  }

  function removeGroup(group: string) {
    if (group === UNGROUPED_GROUP) return;
    commands.value = commands.value.map((c) =>
      c.group === group ? { ...c, group: UNGROUPED_GROUP } : c
    );
    groups.value = groups.value.filter((g) => g !== group);
    ensureGroup(UNGROUPED_GROUP);
  }

  function upsert(input: {
    id?: string;
    name: string;
    command: string;
    group?: string;
  }): QuickCommand {
    const name = input.name.trim();
    const command = input.command.trim();
    if (!name) throw new Error("name required");
    if (!command) throw new Error("command required");
    const group = ensureGroup(input.group ?? UNGROUPED_GROUP);
    if (input.id) {
      const idx = commands.value.findIndex((c) => c.id === input.id);
      if (idx >= 0) {
        const next = { ...commands.value[idx], name, command, group };
        const list = [...commands.value];
        list[idx] = next;
        commands.value = list;
        return next;
      }
    }
    const created: QuickCommand = {
      id: newId(),
      name,
      command,
      group,
    };
    commands.value = [created, ...commands.value];
    return created;
  }

  function remove(id: string) {
    commands.value = commands.value.filter((c) => c.id !== id);
  }

  function findById(id: string) {
    return commands.value.find((c) => c.id === id) ?? null;
  }

  return {
    commands,
    groups,
    grouped,
    addGroup,
    renameGroup,
    removeGroup,
    upsert,
    remove,
    findById,
    ensureGroup,
  };
});
