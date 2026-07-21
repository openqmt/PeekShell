/**
 * 主机列表与分组操作。
 * 凭证明文不进入本 store，仅保存后端返回的 HostRecord。
 */
import { defineStore } from "pinia";
import { computed, ref } from "vue";
import * as api from "../api/tauri";
import type { HostRecord, HostUpsert } from "../types/host";

export const useHostsStore = defineStore("hosts", () => {
  const hosts = ref<HostRecord[]>([]);
  const groupNames = ref<string[]>([]);
  const loading = ref(false);
  const error = ref("");

  const groups = computed(() => {
    const map = new Map<string, HostRecord[]>();
    for (const group of groupNames.value) {
      map.set(group, []);
    }
    for (const host of hosts.value) {
      const list = map.get(host.group) ?? [];
      list.push(host);
      map.set(host.group, list);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  });

  async function refresh() {
    loading.value = true;
    error.value = "";
    try {
      const [hostList, groupsList] = await Promise.all([api.listHosts(), api.listGroups()]);
      hosts.value = hostList;
      groupNames.value = groupsList;
    } catch (e) {
      error.value = String(e);
    } finally {
      loading.value = false;
    }
  }

  async function upsert(payload: HostUpsert) {
    const saved = await api.upsertHost(payload);
    await refresh();
    return saved;
  }

  async function remove(id: string) {
    await api.deleteHost(id);
    await refresh();
  }

  async function createGroup(name: string) {
    await api.createGroup(name);
    await refresh();
  }

  async function renameGroup(from: string, to: string) {
    await api.renameGroup(from, to);
    await refresh();
  }

  async function removeGroup(group: string) {
    await api.deleteGroup(group);
    await refresh();
  }

  function findById(id: string) {
    return hosts.value.find((h) => h.id === id);
  }

  return {
    hosts,
    groupNames,
    loading,
    error,
    groups,
    refresh,
    upsert,
    remove,
    createGroup,
    renameGroup,
    removeGroup,
    findById,
  };
});
