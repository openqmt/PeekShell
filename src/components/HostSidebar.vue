<script setup lang="ts">
/**
 * 左侧：当前会话主机概览，可折叠为窄条。
 * 有活动会话时每秒刷新一次主机指标。
 */
import { storeToRefs } from "pinia";
import { onBeforeUnmount, ref, watch } from "vue";
import { useI18n } from "../i18n";
import { useSessionsStore } from "../stores/sessions";
import { useUiStore } from "../stores/ui";
import { useHostsStore } from "../stores/hosts";

const sessions = useSessionsStore();
const hosts = useHostsStore();
const ui = useUiStore();
const { t, locale, toggleLocale, groupLabel } = useI18n();
const { metrics, activeSession, connecting } = storeToRefs(sessions);
const { sidebarCollapsed, theme, displayPrefs } = storeToRefs(ui);

const METRICS_INTERVAL_MS = 1000;
let metricsTimer: ReturnType<typeof setInterval> | null = null;
const metricsRefreshing = ref(false);

async function pollMetrics() {
  if (!activeSession.value || metricsRefreshing.value) return;
  metricsRefreshing.value = true;
  try {
    await sessions.refreshMetrics();
  } finally {
    metricsRefreshing.value = false;
  }
}

function stopMetricsPolling() {
  if (metricsTimer) {
    clearInterval(metricsTimer);
    metricsTimer = null;
  }
}

function startMetricsPolling() {
  stopMetricsPolling();
  void pollMetrics();
  metricsTimer = setInterval(() => {
    void pollMetrics();
  }, METRICS_INTERVAL_MS);
}

watch(
  activeSession,
  (session) => {
    if (session) startMetricsPolling();
    else stopMetricsPolling();
  },
  { immediate: true }
);

onBeforeUnmount(stopMetricsPolling);

function barClass(pct: number) {
  if (pct >= 85) return "bar danger";
  if (pct >= 70) return "bar warn";
  return "bar";
}

function pct(used: number, total: number) {
  if (!total) return 0;
  return Math.min(100, Math.round((used / total) * 100));
}

function hostMeta() {
  if (!activeSession.value) return null;
  return hosts.findById(activeSession.value.hostId);
}
</script>

<template>
  <aside class="sidebar">
    <div v-if="!sidebarCollapsed" class="sidebar-toolbar">
      <span class="panel-title">{{ t("sidebar.host") }}</span>
      <div class="toolbar-actions">
        <button
          class="icon-btn lang-btn"
          type="button"
          :title="t('sidebar.language')"
          @click="toggleLocale()"
        >
          {{ locale === "zh" ? "EN" : "中" }}
        </button>
        <button
          class="icon-btn"
          type="button"
          :title="t('sidebar.settings')"
          @click="ui.openDisplaySettingsModal()"
        >
          ⚙
        </button>
        <button
          class="icon-btn"
          type="button"
          :title="theme === 'dark' ? t('sidebar.themeToLight') : t('sidebar.themeToDark')"
          @click="ui.toggleTheme()"
        >
          {{ theme === "dark" ? "☀" : "☾" }}
        </button>
        <button class="icon-btn" type="button" :title="t('sidebar.collapse')" @click="sidebarCollapsed = true">«</button>
      </div>
    </div>

    <div v-if="sidebarCollapsed" class="sidebar-rail">
      <button class="icon-btn" type="button" :title="t('sidebar.expand')" @click="sidebarCollapsed = false">»</button>
      <button
        class="icon-btn lang-btn"
        type="button"
        :title="t('sidebar.language')"
        @click="toggleLocale()"
      >
        {{ locale === "zh" ? "EN" : "中" }}
      </button>
      <button
        class="icon-btn"
        type="button"
        :title="t('sidebar.settings')"
        @click="ui.openDisplaySettingsModal()"
      >
        ⚙
      </button>
      <button
        class="icon-btn"
        type="button"
        :title="theme === 'dark' ? t('sidebar.themeToLight') : t('sidebar.themeToDark')"
        @click="ui.toggleTheme()"
      >
        {{ theme === "dark" ? "☀" : "☾" }}
      </button>
      <span
        class="rail-status"
        :class="{ on: !!activeSession, connecting: connecting && !activeSession }"
        :title="t('sidebar.status')"
      />
      <span class="rail-cpu">CPU {{ Math.round(activeSession && metrics ? metrics.cpuPercent : 0) }}%</span>
    </div>

    <div v-else class="sidebar-body">
      <div
        class="host-switcher"
        :class="{ connected: !!activeSession, connecting: connecting && !activeSession }"
        role="button"
        tabindex="0"
        @click="ui.openHostsModal()"
      >
        <span class="status" />
        <div class="names">
          <strong>{{ activeSession?.title ?? t("sidebar.disconnected") }}</strong>
          <span>{{ hostMeta() ? groupLabel(hostMeta()!.group) : t("sidebar.selectHost") }}</span>
        </div>
        <span class="chev" aria-hidden="true">
          <svg viewBox="0 0 16 16" width="14" height="14" fill="none">
            <path
              d="M6 3.5 10.5 8 6 12.5"
              stroke="currentColor"
              stroke-width="1.6"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
        </span>
      </div>

      <div class="info-scroll">
        <div v-if="!activeSession || !metrics" class="info-card muted">
          {{ connecting ? t("sidebar.connecting") : t("sidebar.connectHint") }}
        </div>
        <template v-else>
          <div v-if="displayPrefs.sidebar.system" class="info-card">
            <h3>{{ t("sidebar.system") }}</h3>
            <dl class="kv">
              <dt>IP</dt><dd>{{ metrics.ip }}</dd>
              <dt>{{ t("sidebar.os") }}</dt><dd>{{ metrics.os || "—" }}</dd>
              <dt>{{ t("sidebar.kernel") }}</dt><dd>{{ metrics.kernel || "—" }}</dd>
              <dt>{{ t("sidebar.arch") }}</dt><dd>{{ metrics.arch || "—" }}</dd>
              <dt>{{ t("sidebar.uptime") }}</dt><dd>{{ t("sidebar.days", { n: metrics.uptimeDays }) }}</dd>
            </dl>
          </div>

          <div v-if="displayPrefs.sidebar.resources" class="info-card">
            <h3>{{ t("sidebar.resources") }}</h3>
            <div class="metric">
              <span class="label">CPU</span>
              <div :class="barClass(metrics.cpuPercent)">
                <i :style="{ width: metrics.cpuPercent + '%' }" />
                <span class="value">{{ Math.round(metrics.cpuPercent) }}%</span>
              </div>
            </div>
            <div class="metric">
              <span class="label">{{ t("sidebar.memory") }}</span>
              <div :class="barClass(pct(metrics.memUsedGiB, metrics.memTotalGiB))">
                <i :style="{ width: pct(metrics.memUsedGiB, metrics.memTotalGiB) + '%' }" />
                <span class="value">{{ metrics.memUsedGiB.toFixed(1) }} / {{ metrics.memTotalGiB.toFixed(1) }} GiB</span>
              </div>
            </div>
            <div class="metric">
              <span class="label">{{ t("sidebar.swap") }}</span>
              <div :class="barClass(pct(metrics.swapUsedMiB, metrics.swapTotalMiB))">
                <i :style="{ width: pct(metrics.swapUsedMiB, metrics.swapTotalMiB) + '%' }" />
                <span class="value">{{ Math.round(metrics.swapUsedMiB) }} / {{ Math.round(metrics.swapTotalMiB) }} MiB</span>
              </div>
            </div>
            <div class="metric">
              <span class="label">{{ t("sidebar.disk") }}</span>
              <div :class="barClass(pct(metrics.diskUsedGiB, metrics.diskTotalGiB))">
                <i :style="{ width: pct(metrics.diskUsedGiB, metrics.diskTotalGiB) + '%' }" />
                <span class="value">{{ metrics.diskUsedGiB.toFixed(1) }} / {{ metrics.diskTotalGiB.toFixed(1) }} GiB</span>
              </div>
            </div>
          </div>

          <div v-if="displayPrefs.sidebar.processes" class="info-card">
            <h3>{{ t("sidebar.processes") }}</h3>
            <div v-if="metrics.topProcesses.length" class="process-table">
              <div class="process-head">
                <span>{{ t("sidebar.process") }}</span>
                <span>{{ t("sidebar.memory") }}</span>
                <span>CPU</span>
              </div>
              <div
                v-for="(process, index) in metrics.topProcesses"
                :key="`${process.name}-${index}`"
                class="process-row"
              >
                <span class="process-name" :title="process.name">{{ process.name }}</span>
                <span>{{ process.memoryMiB.toFixed(1) }} MiB</span>
                <span>{{ process.cpuPercent.toFixed(1) }}%</span>
              </div>
            </div>
            <div v-else class="process-empty">{{ t("sidebar.noProcesses") }}</div>
          </div>

          <div v-if="displayPrefs.sidebar.network" class="info-card">
            <h3>{{ t("sidebar.network", { iface: metrics.netIface }) }}</h3>
            <div class="net-row">
              <span class="dir">↓ RX</span>
              <span class="rate">{{ metrics.netRxMBs.toFixed(1) }} MB/s</span>
              <span class="total">{{ t("sidebar.totalGb", { n: metrics.netRxTotalGB.toFixed(0) }) }}</span>
            </div>
            <div class="net-row">
              <span class="dir">↑ TX</span>
              <span class="rate">{{ metrics.netTxKBs.toFixed(0) }} KB/s</span>
              <span class="total">{{ t("sidebar.totalGb", { n: metrics.netTxTotalGB.toFixed(0) }) }}</span>
            </div>
          </div>

          <div
            v-if="
              !displayPrefs.sidebar.system &&
              !displayPrefs.sidebar.resources &&
              !displayPrefs.sidebar.processes &&
              !displayPrefs.sidebar.network
            "
            class="info-card muted"
          >
            {{ t("displaySettings.sidebarEmpty") }}
          </div>
        </template>
      </div>
    </div>
  </aside>
</template>

<style scoped>
.sidebar {
  background: var(--bg-panel);
  border-right: 1px solid var(--border-soft);
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}

.sidebar-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 4px 0 10px;
  min-height: 32px;
}

.toolbar-actions {
  display: flex;
  align-items: center;
  gap: 0;
}

.lang-btn {
  font-size: 11px;
  /* font-weight: 700; */
  letter-spacing: 0.02em;
}

.panel-title {
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.07em;
  color: var(--text-dim);
}

.sidebar-rail {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 6px 0 10px;
  gap: 6px;
}

.rail-status {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--text-dim);
  box-shadow: none;
}

.rail-status.on {
  background: var(--accent);
  box-shadow: 0 0 0 3px rgba(62, 207, 142, 0.2);
}

.rail-status.connecting {
  background: var(--warn);
  box-shadow: 0 0 0 3px var(--warn-dim);
}

.rail-cpu {
  writing-mode: vertical-rl;
  transform: rotate(180deg);
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--text-dim);
}

.sidebar-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.host-switcher {
  margin: 6px 8px 0;
  padding: 8px 10px;
  border-radius: 6px;
  border: 1px solid var(--border);
  background: var(--bg-elevated);
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  transition: border-color 0.15s ease, background 0.15s ease;
}

.host-switcher:hover {
  background: var(--bg-hover);
}

.host-switcher.connected {
  border-color: var(--accent-border);
  background: var(--accent-dim);
}

.host-switcher.connecting {
  border-color: rgba(230, 162, 60, 0.35);
  background: var(--warn-dim);
}

.host-switcher .status {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--text-dim);
  box-shadow: none;
  flex-shrink: 0;
}

.host-switcher.connected .status {
  background: var(--accent);
  box-shadow: 0 0 0 3px rgba(62, 207, 142, 0.2);
}

.host-switcher.connecting .status {
  background: var(--warn);
  box-shadow: 0 0 0 3px var(--warn-dim);
}

.names { flex: 1; min-width: 0; }
.names strong { display: block; font-size: 13px; }
.names span { font-size: 11px; color: var(--text-muted); font-family: var(--font-mono); }
.chev {
  color: var(--text-dim);
  display: grid;
  place-items: center;
  flex-shrink: 0;
  transition: color 0.15s ease, transform 0.15s ease;
}

.host-switcher:hover .chev {
  color: var(--accent);
  transform: translateX(1px);
}

.info-scroll {
  flex: 1;
  overflow: auto;
  padding: 6px 8px 8px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.info-card {
  background: var(--bg-elevated);
  border: 1px solid var(--border-soft);
  border-radius: 6px;
  padding: 8px 10px;
}

.info-card.muted {
  color: var(--text-muted);
  font-size: 12px;
  line-height: 1.4;
}

.info-card h3 {
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.07em;
  color: var(--text-dim);
  margin-bottom: 6px;
}

.kv {
  display: grid;
  grid-template-columns: 64px 1fr;
  gap: 4px 6px;
  font-size: 12px;
}

.kv dt { color: var(--text-dim); font-size: 11px; }
.kv dd { font-family: var(--font-mono); font-size: 11.5px; word-break: break-all; }

.metric {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 6px;
  align-items: center;
}
.metric + .metric { margin-top: 5px; }
.metric .label {
  font-size: 11px;
  color: var(--text-dim);
}

.bar {
  position: relative;
  height: 16px;
  border-radius: 999px;
  background: var(--bg-root);
  overflow: hidden;
  border: 1px solid var(--border-soft);
  min-width: 0;
}
.bar > i {
  display: block;
  height: 100%;
  background: var(--accent);
}
.bar.warn > i { background: var(--warn); }
.bar.danger > i { background: var(--danger); }
.bar .value {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  font-family: var(--font-mono);
  font-size: 11.5px;
  color: var(--text);
  text-shadow: 0 0 3px var(--bg-root);
  pointer-events: none;
  white-space: nowrap;
  padding: 0 8px;
}

.process-table {
  font-family: var(--font-mono);
  font-size: 10.5px;
}

.process-head,
.process-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 68px 42px;
  gap: 6px;
  align-items: center;
}

.process-head {
  padding-bottom: 4px;
  color: var(--text-dim);
  border-bottom: 1px solid var(--border-soft);
}

.process-row {
  padding: 3px 0;
  color: var(--text-muted);
  border-bottom: 1px solid var(--border-soft);
}

.process-row:last-child { border-bottom: none; }
.process-head span:not(:first-child),
.process-row span:not(:first-child) { text-align: right; }
.process-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text);
}
.process-empty { color: var(--text-dim); font-size: 11px; }

.net-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 11.5px;
  padding: 2px 0;
  font-family: var(--font-mono);
}
.net-row .dir { color: var(--text-dim); width: 28px; }
.net-row .rate { color: var(--term-cyan); }
.net-row .total { color: var(--text-muted); font-size: 10.5px; }
</style>
