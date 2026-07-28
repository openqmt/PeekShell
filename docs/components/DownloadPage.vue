<script setup lang="ts">
/**
 * Download center for docs.
 * Prefers build-time data from docs/static/releases.data.ts.
 * If prefetch failed (empty snapshot), falls back to a client GitHub fetch.
 */
import { computed, onMounted, ref, watch } from 'vue'
import { useData } from 'vitepress'
import { data as releasesData } from '../static/releases.data'
import {
    normalizeReleases,
    RELEASES_URL,
    type ArchKey,
    type GithubRelease,
    type PackageKey,
    type PlatformKey,
    type ReleaseAsset,
} from '../static/parseReleases'

type LocaleKey = 'zh' | 'en'
type MatchTier = 'perfect' | 'archFallback' | 'osFallback'

type DetectedSystem = {
    platform: PlatformKey | null
    arch: ArchKey | null
}

type Recommendation = {
    asset: ReleaseAsset
    tier: MatchTier
}

type ArchGroup = {
    arch: ArchKey
    assets: ReleaseAsset[]
}

const COPY = {
    zh: {
        loading: '正在获取最新版本…',
        error: '暂时无法获取 GitHub Releases，请稍后重试。',
        noAssets: '当前发布中没有可展示的桌面安装包。',
        recommended: '推荐给你',
        otherDownloads: '其他平台',
        githubRelease: 'GitHub Release',
        directDownload: '立即下载',
        proxyDownload: '加速下载1',
        proxyDownloadV6: '加速下载2',
        exactMatch: '已匹配当前系统与架构',
        archFallback: '已匹配当前系统，架构为可用备选',
        osFallback: '未能识别设备，展示默认热门安装包',
        detected: '当前',
        emptyPlatform: '该平台暂无安装包',
        windows: 'Windows',
        macos: 'macOS',
        linux: 'Linux',
        x64: 'x64',
        arm64: 'ARM64',
        exe: 'Setup',
        msi: 'MSI',
        dmg: 'DMG',
        app: 'App Bundle',
        deb: 'DEB',
        rpm: 'RPM',
        appimage: 'AppImage',
        unknownDevice: '未识别',
    },
    en: {
        loading: 'Loading the latest release…',
        error: 'Unable to load GitHub Releases right now. Please try again later.',
        noAssets:
            'No desktop release assets are available in the latest release.',
        recommended: 'Recommended for you',
        otherDownloads: 'Other platforms',
        githubRelease: 'GitHub Release',
        directDownload: 'Download now',
        exactMatch: 'Matched to your OS and CPU',
        archFallback: 'Matched your OS with the closest available CPU build',
        osFallback: 'Device detection unavailable — showing a safe default',
        detected: 'Detected',
        emptyPlatform: 'No installs for this platform yet',
        windows: 'Windows',
        macos: 'macOS',
        linux: 'Linux',
        x64: 'x64',
        arm64: 'ARM64',
        exe: 'Setup',
        msi: 'MSI',
        dmg: 'DMG',
        app: 'App Bundle',
        deb: 'DEB',
        rpm: 'RPM',
        appimage: 'AppImage',
        unknownDevice: 'Unknown',
    },
} as const

const { lang } = useData()
const platformOrder: PlatformKey[] = ['windows', 'macos', 'linux']
const PROXY_PREFIXES = {
    default: 'https://gh-proxy.org/',
    v6: 'https://v6.gh-proxy.org/',
} as const

const localeKey = computed<LocaleKey>(() =>
    (lang.value || '').toLowerCase().startsWith('en') ? 'en' : 'zh'
)
const ui = computed(() => COPY[localeKey.value])
// gh-proxy mirrors are mainly useful for CN; other locales use GitHub directly.
const isZh = computed(() => localeKey.value === 'zh')

const version = ref(releasesData.version)
const htmlUrl = ref(releasesData.htmlUrl)
const assets = ref<ReleaseAsset[]>(releasesData.assets)
const loading = ref(!releasesData.assets.length)
const error = ref('')

const detectedSystem = ref<DetectedSystem>({ platform: null, arch: null })
const activePlatform = ref<PlatformKey>(
    releasesData.assets[0]?.platform ?? 'windows'
)

const recommendation = computed<Recommendation | null>(() => {
    if (!assets.value.length) return null

    const system = detectedSystem.value
    if (system.platform && system.arch) {
        const exact = pickPreferredAsset(
            assets.value.filter(
                (asset) =>
                    asset.platform === system.platform &&
                    asset.arch === system.arch
            )
        )
        if (exact) return { asset: exact, tier: 'perfect' }
    }

    if (system.platform) {
        const sameOs = pickPreferredAsset(
            assets.value.filter((asset) => asset.platform === system.platform)
        )
        if (sameOs) return { asset: sameOs, tier: 'archFallback' }
    }

    const fallback = pickPreferredAsset(assets.value)
    return fallback ? { asset: fallback, tier: 'osFallback' } : null
})

const tabPlatforms = computed(() => {
    const detected = detectedSystem.value.platform
    if (!detected) return platformOrder
    return [detected, ...platformOrder.filter((p) => p !== detected)]
})

const activeArchGroups = computed<ArchGroup[]>(() => {
    const list = sortAssets(
        assets.value.filter((asset) => asset.platform === activePlatform.value)
    )
    const groups: ArchGroup[] = []
    // macOS: Apple Silicon first — most Macs are arm64 now.
    for (const arch of preferredArchs(activePlatform.value)) {
        const archAssets = list.filter((asset) => asset.arch === arch)
        if (archAssets.length) groups.push({ arch, assets: archAssets })
    }
    return groups
})

const deviceLabel = computed(() => {
    const system = detectedSystem.value
    if (!system.platform && !system.arch) return ui.value.unknownDevice

    const parts: string[] = []
    if (system.platform) parts.push(platformLabel(system.platform))
    if (system.arch) parts.push(archLabel(system.arch))
    return parts.join(' · ')
})

const matchHint = computed(() => {
    const tier = recommendation.value?.tier
    if (tier === 'perfect') return ui.value.exactMatch
    if (tier === 'archFallback') return ui.value.archFallback
    return ui.value.osFallback
})

watch(
    () => detectedSystem.value.platform,
    (platform) => {
        if (platform) activePlatform.value = platform
    }
)

function platformLabel(platform: PlatformKey): string {
    return ui.value[platform]
}

function archLabel(arch: ArchKey): string {
    return ui.value[arch]
}

function packageLabel(packageType: PackageKey): string {
    return ui.value[packageType]
}

function normalizeArch(value: string): ArchKey | null {
    if (/(arm64|aarch64)/.test(value)) return 'arm64'
    if (/(x64|x86_64|amd64)/.test(value)) return 'x64'
    return null
}

function detectSystem(): DetectedSystem {
    const source = [
        readUserAgentDataPlatform(),
        navigator.platform || '',
        navigator.userAgent || '',
    ]
        .join(' ')
        .toLowerCase()

    const archSource = [
        readUserAgentDataArch(),
        navigator.userAgent || '',
        navigator.platform || '',
    ]
        .join(' ')
        .toLowerCase()

    let platform: PlatformKey | null = null
    if (/(win)/.test(source)) platform = 'windows'
    else if (/(mac|darwin)/.test(source)) platform = 'macos'
    else if (/(linux|x11)/.test(source)) platform = 'linux'

    return {
        platform,
        arch: normalizeArch(archSource),
    }
}

function readUserAgentDataPlatform(): string {
    const navigatorWithUserAgentData = navigator as Navigator & {
        userAgentData?: { platform?: string }
    }
    return navigatorWithUserAgentData.userAgentData?.platform || ''
}

function readUserAgentDataArch(): string {
    const navigatorWithUserAgentData = navigator as Navigator & {
        userAgentData?: { architecture?: string }
    }
    return navigatorWithUserAgentData.userAgentData?.architecture || ''
}

function preferredArchs(platform: PlatformKey): ArchKey[] {
    // Prefer arm64 on macOS: Apple Silicon is the common case; Intel is fallback.
    if (platform === 'macos') return ['arm64', 'x64']
    return ['x64', 'arm64']
}

function packageRank(asset: ReleaseAsset): number {
    const ranks: Record<PlatformKey, PackageKey[]> = {
        windows: ['exe', 'msi', 'app', 'dmg', 'deb', 'rpm', 'appimage'],
        macos: ['dmg', 'app', 'exe', 'msi', 'deb', 'rpm', 'appimage'],
        linux: ['deb', 'appimage', 'rpm', 'app', 'dmg', 'exe', 'msi'],
    }
    return ranks[asset.platform].indexOf(asset.packageType)
}

function sortAssets(list: ReleaseAsset[]): ReleaseAsset[] {
    return [...list].sort((a, b) => {
        if (a.platform !== b.platform) {
            return (
                platformOrder.indexOf(a.platform) -
                platformOrder.indexOf(b.platform)
            )
        }
        if (a.arch !== b.arch) {
            return (
                preferredArchs(a.platform).indexOf(a.arch) -
                preferredArchs(a.platform).indexOf(b.arch)
            )
        }
        const packageOrder = packageRank(a) - packageRank(b)
        if (packageOrder !== 0) return packageOrder
        return a.name.localeCompare(b.name)
    })
}

function pickPreferredAsset(list: ReleaseAsset[]): ReleaseAsset | null {
    const [first] = sortAssets(list)
    return first || null
}

function formatSize(size: number): string {
    if (!size) return '-'
    const units = ['B', 'KB', 'MB', 'GB']
    let value = size
    let unitIndex = 0
    while (value >= 1024 && unitIndex < units.length - 1) {
        value /= 1024
        unitIndex += 1
    }
    return `${value >= 100 ? value.toFixed(0) : value.toFixed(1)} ${
        units[unitIndex]
    }`
}

/** Prefix GitHub asset URL with a gh-proxy mirror for faster access in CN. */
function proxyDownloadUrl(
    url: string,
    kind: keyof typeof PROXY_PREFIXES = 'default'
): string {
    return `${PROXY_PREFIXES[kind]}${url}`
}

function isRecommended(asset: ReleaseAsset): boolean {
    return recommendation.value?.asset.id === asset.id
}

function platformCount(platform: PlatformKey): number {
    return assets.value.filter((asset) => asset.platform === platform).length
}

function applySnapshot(snapshot: {
    version: string
    htmlUrl: string
    assets: ReleaseAsset[]
}) {
    version.value = snapshot.version
    htmlUrl.value = snapshot.htmlUrl
    assets.value = snapshot.assets
    if (detectedSystem.value.platform) {
        activePlatform.value = detectedSystem.value.platform
    } else if (snapshot.assets[0]) {
        activePlatform.value = snapshot.assets[0].platform
    }
}

async function loadClientFallback() {
    loading.value = true
    error.value = ''
    try {
        const res = await fetch(RELEASES_URL, {
            headers: { Accept: 'application/vnd.github+json' },
            cache: 'no-store',
        })
        if (!res.ok) throw new Error(String(res.status))
        const payload = (await res.json()) as GithubRelease[]
        const snapshot = normalizeReleases(payload)
        if (!snapshot.assets.length) throw new Error('empty')
        applySnapshot(snapshot)
    } catch {
        error.value = ui.value.error
    } finally {
        loading.value = false
    }
}

onMounted(async () => {
    detectedSystem.value = detectSystem()
    if (detectedSystem.value.platform) {
        activePlatform.value = detectedSystem.value.platform
    } else if (recommendation.value) {
        activePlatform.value = recommendation.value.asset.platform
    }

    // Prefetch empty (e.g. GitHub 504 at build) → fetch once in the browser.
    if (!assets.value.length) await loadClientFallback()
})
</script>

<template>
    <section class="download-page">
        <div v-if="loading" class="dl-state">{{ ui.loading }}</div>
        <div v-else-if="error" class="dl-state dl-state-error">{{ error }}</div>
        <div v-else-if="!assets.length" class="dl-state">{{ ui.noAssets }}</div>

        <template v-else>
            <article v-if="recommendation" class="dl-recommend">
                <div class="dl-recommend-main">
                    <span class="dl-recommend-kicker">{{
                        ui.recommended
                    }}</span>
                    <h1>
                        {{ platformLabel(recommendation.asset.platform) }}
                        {{ archLabel(recommendation.asset.arch) }}
                        ·
                        {{ packageLabel(recommendation.asset.packageType) }}
                    </h1>
                    <p class="dl-recommend-hint">{{ matchHint }}</p>
                    <!-- <p class="dl-recommend-file">
                        {{ recommendation.asset.name }}
                    </p> -->
                    <div class="dl-recommend-stats">
                        <span v-if="version">{{ version }}</span>
                        <span>{{ deviceLabel }}</span>
                        <span>{{ formatSize(recommendation.asset.size) }}</span>
                    </div>
                </div>
                <div class="dl-recommend-actions">
                    <template v-if="isZh">
                        <a
                            class="dl-btn dl-btn-primary"
                            :href="proxyDownloadUrl(recommendation.asset.url)"
                            target="_blank"
                            rel="noreferrer"
                        >
                            {{ COPY.zh.proxyDownload }}
                        </a>
                        <a
                            class="dl-btn dl-btn-proxy"
                            :href="
                                proxyDownloadUrl(recommendation.asset.url, 'v6')
                            "
                            target="_blank"
                            rel="noreferrer"
                        >
                            {{ COPY.zh.proxyDownloadV6 }}
                        </a>
                    </template>
                    <a
                        v-else
                        class="dl-btn dl-btn-primary"
                        :href="recommendation.asset.url"
                        target="_blank"
                        rel="noreferrer"
                    >
                        {{ ui.directDownload }}
                    </a>
                    <a
                        class="dl-btn dl-btn-ghost"
                        :href="htmlUrl"
                        target="_blank"
                        rel="noreferrer"
                    >
                        {{ ui.githubRelease }}
                    </a>
                </div>
            </article>

            <section class="dl-browse" aria-label="platforms">
                <div class="dl-browse-head">
                    <h2>{{ ui.otherDownloads }}</h2>
                </div>

                <div class="dl-tabs" role="tablist">
                    <button
                        v-for="platform in tabPlatforms"
                        :key="platform"
                        type="button"
                        role="tab"
                        class="dl-tab"
                        :class="{ active: activePlatform === platform }"
                        :aria-selected="activePlatform === platform"
                        @click="activePlatform = platform"
                    >
                        <span>{{ platformLabel(platform) }}</span>
                        <em v-if="detectedSystem.platform === platform">{{
                            ui.detected
                        }}</em>
                        <small>{{ platformCount(platform) }}</small>
                    </button>
                </div>

                <div class="dl-panel" role="tabpanel">
                    <div v-if="!activeArchGroups.length" class="dl-state">
                        {{ ui.emptyPlatform }}
                    </div>

                    <div
                        v-for="group in activeArchGroups"
                        :key="group.arch"
                        class="dl-arch-group"
                    >
                        <h3>{{ archLabel(group.arch) }}</h3>
                        <ul class="dl-list">
                            <li v-for="asset in group.assets" :key="asset.id">
                                <a
                                    class="dl-row"
                                    :class="{
                                        recommended: isRecommended(asset),
                                    }"
                                    :href="asset.url"
                                    target="_blank"
                                    rel="noreferrer"
                                >
                                    <div class="dl-row-main">
                                        <strong>{{
                                            packageLabel(asset.packageType)
                                        }}</strong>
                                        <span class="dl-row-name">{{
                                            asset.name
                                        }}</span>
                                    </div>
                                    <div class="dl-row-meta">
                                        <span>{{
                                            formatSize(asset.size)
                                        }}</span>
                                        <span class="dl-row-cta">{{
                                            ui.directDownload
                                        }}</span>
                                    </div>
                                </a>
                            </li>
                        </ul>
                    </div>
                </div>
            </section>
        </template>
    </section>
</template>

<style scoped>
.download-page {
    box-sizing: border-box;
    display: grid;
    gap: 28px;
    width: 100%;
    max-width: 960px;
    margin: 0 auto;
    padding: calc(var(--vp-nav-height, 64px) + 32px) 24px 72px;
}

@media (max-width: 960px) {
    .download-page {
        padding: calc(var(--vp-nav-height, 64px) + 12px) 20px 56px;
    }
}

/* —— States —— */
.dl-state {
    padding: 28px 20px;
    border: 1px dashed var(--vp-c-divider);
    border-radius: 14px;
    text-align: center;
    color: var(--vp-c-text-2);
    font-size: 14px;
}

.dl-state-error {
    color: #dc2626;
    border-color: color-mix(in srgb, #dc2626 35%, var(--vp-c-divider));
}

/* —— Recommend —— */
.dl-recommend {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 24px;
    align-items: center;
    padding: 28px;
    border: 1px solid
        color-mix(in srgb, var(--vp-c-brand-1) 28%, var(--vp-c-divider));
    border-radius: 20px;
    background: radial-gradient(
            circle at top right,
            var(--vp-c-brand-soft),
            transparent 42%
        ),
        var(--vp-c-bg-soft);
}

.dl-recommend-kicker {
    display: inline-flex;
    align-items: center;
    min-height: 28px;
    padding: 0 12px;
    border-radius: 999px;
    background: var(--vp-c-brand-1);
    color: #fff;
    font-size: 13px;
    font-weight: 700;
    letter-spacing: 0.02em;
    box-shadow: 0 2px 8px
        color-mix(in srgb, var(--vp-c-brand-1) 35%, transparent);
}

.dl-recommend-main h1 {
    margin: 12px 0 6px;
    font-size: clamp(22px, 3vw, 28px);
    line-height: 1.2;
    letter-spacing: -0.02em;
}

.dl-recommend-hint {
    margin: 0 0 12px;
    color: var(--vp-c-text-2);
    font-size: 14px;
}

.dl-recommend-file {
    margin: 0;
    color: var(--vp-c-text-3);
    font-size: 13px;
    word-break: break-all;
}

.dl-recommend-stats {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    margin-top: 14px;
    color: var(--vp-c-text-2);
    font-size: 13px;
}

.dl-recommend-actions {
    display: grid;
    gap: 10px;
    min-width: 188px;
}

.dl-btn {
    display: inline-flex;
    justify-content: center;
    align-items: center;
    min-height: 44px;
    padding: 0 18px;
    border-radius: 12px;
    font-size: 14px;
    font-weight: 650;
    text-decoration: none;
    transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease;
}

.dl-btn-primary {
    background: var(--vp-c-brand-1);
    color: #fff;
}

.dl-btn-primary:hover {
    background: var(--vp-c-brand-2);
}

.dl-btn-proxy {
    border: 1px solid
        color-mix(in srgb, var(--vp-c-brand-1) 45%, var(--vp-c-divider));
    color: var(--vp-c-brand-1);
    background: color-mix(in srgb, var(--vp-c-brand-soft) 70%, var(--vp-c-bg));
}

.dl-btn-proxy:hover {
    border-color: var(--vp-c-brand-1);
    background: var(--vp-c-brand-soft);
}

.dl-btn-ghost {
    border: 1px solid var(--vp-c-divider);
    color: var(--vp-c-text-1);
    background: var(--vp-c-bg);
}

.dl-btn-ghost:hover {
    border-color: var(--vp-c-brand-1);
    color: var(--vp-c-brand-1);
}

/* —— Browse —— */
.dl-browse {
    display: grid;
    gap: 16px;
}

.dl-browse-head h2 {
    margin: 0;
    font-size: 18px;
    font-weight: 650;
}

.dl-tabs {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    padding: 4px;
    border: 1px solid var(--vp-c-divider);
    border-radius: 14px;
    background: var(--vp-c-bg-soft);
}

.dl-tab {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    min-height: 40px;
    padding: 0 14px;
    border: none;
    border-radius: 10px;
    background: transparent;
    color: var(--vp-c-text-2);
    font: inherit;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.15s ease, color 0.15s ease;
}

.dl-tab em {
    font-style: normal;
    padding: 2px 6px;
    border-radius: 999px;
    background: var(--vp-c-brand-soft);
    color: var(--vp-c-brand-1);
    font-size: 11px;
    font-weight: 700;
}

.dl-tab small {
    color: var(--vp-c-text-3);
    font-size: 12px;
    font-weight: 500;
}

.dl-tab.active {
    background: var(--vp-c-brand-1);
    color: #fff;
    box-shadow: 0 2px 8px
        color-mix(in srgb, var(--vp-c-brand-1) 35%, transparent);
}

.dl-tab.active em {
    background: rgba(255, 255, 255, 0.22);
    color: #fff;
}

.dl-tab.active small {
    color: rgba(255, 255, 255, 0.78);
}

.dl-tab:hover:not(.active) {
    color: var(--vp-c-text-1);
    background: color-mix(in srgb, var(--vp-c-bg) 70%, transparent);
}

.dl-panel {
    display: grid;
    gap: 20px;
}

.dl-arch-group h3 {
    margin: 0 0 10px;
    color: var(--vp-c-text-2);
    font-size: 13px;
    font-weight: 650;
    letter-spacing: 0.04em;
    text-transform: uppercase;
}

.dl-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 8px;
}

.dl-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 14px 16px;
    border: 1px solid var(--vp-c-divider);
    border-radius: 14px;
    background: var(--vp-c-bg);
    color: inherit;
    text-decoration: none;
    transition: border-color 0.15s ease, background 0.15s ease,
        transform 0.15s ease;
}

.dl-row:hover {
    border-color: var(--vp-c-brand-1);
    transform: translateY(-1px);
}

.dl-row.recommended {
    border-color: color-mix(
        in srgb,
        var(--vp-c-brand-1) 40%,
        var(--vp-c-divider)
    );
    background: color-mix(in srgb, var(--vp-c-brand-soft) 55%, var(--vp-c-bg));
}

.dl-row-main {
    min-width: 0;
    display: grid;
    gap: 4px;
}

.dl-row-main strong {
    font-size: 15px;
}

.dl-row-name {
    color: var(--vp-c-text-3);
    font-size: 12px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.dl-row-meta {
    display: flex;
    align-items: center;
    gap: 14px;
    flex-shrink: 0;
    color: var(--vp-c-text-2);
    font-size: 13px;
}

.dl-row-cta {
    color: var(--vp-c-brand-1);
    font-weight: 650;
}

@media (max-width: 760px) {
    .download-page {
        padding: calc(var(--vp-nav-height, 64px) + 8px) 16px 48px;
        gap: 22px;
    }

    .dl-recommend {
        grid-template-columns: 1fr;
        padding: 20px;
    }

    .dl-recommend-actions {
        min-width: 0;
    }

    .dl-row {
        flex-direction: column;
        align-items: flex-start;
    }

    .dl-row-name {
        white-space: normal;
        word-break: break-all;
    }

    .dl-row-meta {
        width: 100%;
        justify-content: space-between;
    }

    .dl-tabs {
        flex-direction: column;
    }

    .dl-tab {
        justify-content: space-between;
        width: 100%;
    }
}
</style>
