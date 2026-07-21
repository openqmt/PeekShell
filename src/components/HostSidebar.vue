<script setup lang="ts">
/**
 * 左侧：当前会话主机概览，可折叠为窄条。
 * 有活动会话时每秒刷新一次主机指标。
 */
import { storeToRefs } from "pinia";
import { onBeforeUnmount, ref, watch } from "vue";
import { useSessionsStore } from "../stores/sessions";
import { useUiStore } from "../stores/ui";
import { useHostsStore } from "../stores/hosts";

const sessions = useSessionsStore();
const hosts = useHostsStore();
const ui = useUiStore();
const { metrics, activeSession, connecting } = storeToRefs(sessions);
const { sidebarCollapsed, theme } = storeToRefs(ui);

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
      <span class="panel-title">Host</span>
      <div class="toolbar-actions">
        <button
          class="icon-btn"
          type="button"
          :title="theme === 'dark' ? '切换浅色主题' : '切换深色主题'"
          @click="ui.toggleTheme()"
        >
          {{ theme === "dark" ? "☀" : "☾" }}
        </button>
        <button class="icon-btn" type="button" title="折叠侧栏" @click="sidebarCollapsed = true">«</button>
      </div>
    </div>

    <div v-if="sidebarCollapsed" class="sidebar-rail">
      <button class="icon-btn" type="button" title="展开侧栏" @click="sidebarCollapsed = false">»</button>
      <button
        class="icon-btn"
        type="button"
        :title="theme === 'dark' ? '切换浅色主题' : '切换深色主题'"
        @click="ui.toggleTheme()"
      >
        {{ theme === "dark" ? "☀" : "☾" }}
      </button>
      <span class="rail-status" title="状态" />
      <span class="rail-cpu">CPU {{ Math.round(metrics?.cpuPercent ?? 0) }}%</span>
    </div>

    <div v-else class="sidebar-body">
      <div class="host-switcher" role="button" tabindex="0" @click="ui.openHostsModal()">
        <span class="status" />
        <div class="names">
          <strong>{{ activeSession?.title ?? "未连接" }}</strong>
          <span>{{ hostMeta()?.group ?? "选择主机" }}</span>
        </div>
        <span class="chev">▾</span>
      </div>

      <div class="info-scroll">
        <div v-if="!metrics" class="info-card muted">
          {{ connecting ? "正在连接…" : "连接主机后显示系统与资源信息" }}
        </div>
        <template v-else>
          <div class="info-card">
            <h3>系统</h3>
            <dl class="kv">
              <dt>IP</dt><dd>{{ metrics.ip }}</dd>
              <dt>系统</dt><dd>{{ metrics.os || "—" }}</dd>
              <dt>内核</dt><dd>{{ metrics.kernel || "—" }}</dd>
              <dt>架构</dt><dd>{{ metrics.arch || "—" }}</dd>
              <dt>运行时间</dt><dd>{{ metrics.uptimeDays }} 天</dd>
            </dl>
          </div>

          <div class="info-card">
            <h3>资源</h3>
            <div class="metric">
              <div class="metric-top">
                <span class="label">CPU</span>
                <span class="value">{{ Math.round(metrics.cpuPercent) }}%</span>
              </div>
              <div :class="barClass(metrics.cpuPercent)"><i :style="{ width: metrics.cpuPercent + '%' }" /></div>
            </div>
            <div class="metric">
              <div class="metric-top">
                <span class="label">内存</span>
                <span class="value">{{ metrics.memUsedGiB.toFixed(1) }} / {{ metrics.memTotalGiB.toFixed(1) }} GiB</span>
              </div>
              <div :class="barClass(pct(metrics.memUsedGiB, metrics.memTotalGiB))">
                <i :style="{ width: pct(metrics.memUsedGiB, metrics.memTotalGiB) + '%' }" />
              </div>
            </div>
            <div class="metric">
              <div class="metric-top">
                <span class="label">交换</span>
                <span class="value">{{ Math.round(metrics.swapUsedMiB) }} / {{ Math.round(metrics.swapTotalMiB) }} MiB</span>
              </div>
              <div :class="barClass(pct(metrics.swapUsedMiB, metrics.swapTotalMiB))">
                <i :style="{ width: pct(metrics.swapUsedMiB, metrics.swapTotalMiB) + '%' }" />
              </div>
            </div>
            <div class="metric">
              <div class="metric-top">
                <span class="label">磁盘 /</span>
                <span class="value">{{ metrics.diskUsedGiB.toFixed(1) }} / {{ metrics.diskTotalGiB.toFixed(1) }} GiB</span>
              </div>
              <div :class="barClass(pct(metrics.diskUsedGiB, metrics.diskTotalGiB))">
                <i :style="{ width: pct(metrics.diskUsedGiB, metrics.diskTotalGiB) + '%' }" />
              </div>
            </div>
          </div>

          <div class="info-card">
            <h3>进程概览</h3>
            <div v-if="metrics.topProcesses.length" class="process-table">
              <div class="process-head">
                <span>进程</span>
                <span>内存</span>
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
            <div v-else class="process-empty">暂无进程数据</div>
          </div>

          <div class="info-card">
            <h3>网络 · {{ metrics.netIface }}</h3>
            <div class="net-row">
              <span class="dir">↓ RX</span>
              <span class="rate">{{ metrics.netRxMBs.toFixed(1) }} MB/s</span>
              <span class="total">总 {{ metrics.netRxTotalGB.toFixed(0) }} GB</span>
            </div>
            <div class="net-row">
              <span class="dir">↑ TX</span>
              <span class="rate">{{ metrics.netTxKBs.toFixed(0) }} KB/s</span>
              <span class="total">总 {{ metrics.netTxTotalGB.toFixed(0) }} GB</span>
            </div>
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
  padding: 8px 8px 0 12px;
}

.toolbar-actions {
  display: flex;
  align-items: center;
  gap: 2px;
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
  padding: 8px 0 12px;
  gap: 12px;
}

.rail-status {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--accent);
  box-shadow: 0 0 0 3px rgba(62, 207, 142, 0.2);
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
  margin: 12px 12px 0;
  padding: 10px 12px;
  border-radius: 8px;
  border: 1px solid var(--accent-border);
  background: var(--accent-dim);
  display: flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
}

.host-switcher .status {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--accent);
  box-shadow: 0 0 0 3px rgba(62, 207, 142, 0.2);
}

.names { flex: 1; min-width: 0; }
.names strong { display: block; font-size: 13px; }
.names span { font-size: 11px; color: var(--text-muted); font-family: var(--font-mono); }
.chev { color: var(--text-dim); font-size: 11px; }

.info-scroll {
  flex: 1;
  overflow: auto;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.info-card {
  background: var(--bg-elevated);
  border: 1px solid var(--border-soft);
  border-radius: 8px;
  padding: 10px 12px;
}

.info-card.muted {
  color: var(--text-muted);
  font-size: 12px;
  line-height: 1.5;
}

.info-card h3 {
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.07em;
  color: var(--text-dim);
  margin-bottom: 8px;
}

.kv {
  display: grid;
  grid-template-columns: 72px 1fr;
  gap: 6px 8px;
  font-size: 12px;
}

.kv dt { color: var(--text-dim); font-size: 11px; }
.kv dd { font-family: var(--font-mono); font-size: 11.5px; word-break: break-all; }

.metric + .metric { margin-top: 10px; }
.metric-top { display: flex; justify-content: space-between; margin-bottom: 6px; gap: 8px; }
.metric-top .label { font-size: 12px; color: var(--text-muted); }
.metric-top .value { font-family: var(--font-mono); font-size: 11.5px; }

.bar {
  height: 6px;
  border-radius: 999px;
  background: var(--bg-root);
  overflow: hidden;
  border: 1px solid var(--border-soft);
}
.bar > i { display: block; height: 100%; background: var(--accent); }
.bar.warn > i { background: var(--warn); }
.bar.danger > i { background: var(--danger); }

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
  padding-bottom: 5px;
  color: var(--text-dim);
  border-bottom: 1px solid var(--border-soft);
}

.process-row {
  padding: 5px 0;
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
  padding: 4px 0;
  font-family: var(--font-mono);
}
.net-row .dir { color: var(--text-dim); width: 28px; }
.net-row .rate { color: var(--term-cyan); }
.net-row .total { color: var(--text-muted); font-size: 10.5px; }
</style>
