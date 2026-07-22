import type { HeadConfig, TransformContext } from 'vitepress'

/** Production site origin. Override with DOCS_SITE_URL when deploying. */
export const SITE_URL = (
  process.env.DOCS_SITE_URL || 'https://peekshell.app'
).replace(/\/$/, '')

export const OG_IMAGE = `${SITE_URL}/og.png`

export const SITE_NAME = 'PeekShell'

export const DEFAULT_DESCRIPTION = {
  zh: 'PeekShell — 轻量跨平台 SSH 客户端，支持主机管理、多标签终端、远程文件与确认式 AI Agent。',
  en: 'PeekShell — lightweight cross-platform SSH client with host management, multi-tab terminal, remote files, and a confirmation-first AI agent.',
} as const

export const KEYWORDS = {
  zh: 'PeekShell,SSH,SSH客户端,终端,SFTP,远程文件,AI Agent,Tauri,跨平台',
  en: 'PeekShell,SSH,SSH client,terminal,SFTP,remote files,AI agent,Tauri,cross-platform',
} as const

/** Convert VitePress relativePath to a clean site path. */
export function toPath(relativePath: string): string {
  const path = relativePath
    .replace(/(?:(^|\/)index)?\.md$/, '$1')
    .replace(/\.md$/, '')
  return path.startsWith('/') ? path : `/${path}`
}

export function toAbsoluteUrl(relativePath: string): string {
  const path = toPath(relativePath)
  return path === '/' ? `${SITE_URL}/` : `${SITE_URL}${path}`
}

export function isEnglish(relativePath: string): boolean {
  return relativePath === 'en.md' || relativePath.startsWith('en/')
}

/** Pair zh / en paths for the same content page. */
export function localePaths(relativePath: string): { zh: string; en: string } {
  if (isEnglish(relativePath)) {
    const zhRelative =
      relativePath === 'en/index.md' ? 'index.md' : relativePath.slice(3)
    return {
      zh: toPath(zhRelative),
      en: toPath(relativePath),
    }
  }
  return {
    zh: toPath(relativePath),
    en: toPath(relativePath === 'index.md' ? 'en/index.md' : `en/${relativePath}`),
  }
}

export function pageTitle(
  title: string | undefined,
  isHome: boolean,
  locale: 'zh' | 'en',
): string {
  if (isHome) {
    return locale === 'zh'
      ? 'PeekShell — 轻量跨平台 SSH 客户端'
      : 'PeekShell — Lightweight Cross-platform SSH Client'
  }
  return title ? `${title} | PeekShell` : SITE_NAME
}

export function buildSeoHead(ctx: TransformContext): HeadConfig[] {
  const { pageData, siteConfig } = ctx
  const relativePath = pageData.relativePath
  const locale = isEnglish(relativePath) ? 'en' : 'zh'
  const isHome =
    relativePath === 'index.md' || relativePath === 'en/index.md'

  const description =
    pageData.description ||
    pageData.frontmatter.description ||
    siteConfig.site.description ||
    DEFAULT_DESCRIPTION[locale]

  const title = pageTitle(pageData.title, isHome, locale)
  const url = toAbsoluteUrl(relativePath)
  const { zh, en } = localePaths(relativePath)
  const zhUrl = zh === '/' ? `${SITE_URL}/` : `${SITE_URL}${zh}`
  const enUrl = `${SITE_URL}${en}`

  const head: HeadConfig[] = [
    ['link', { rel: 'canonical', href: url }],
    [
      'link',
      { rel: 'alternate', hreflang: 'zh-CN', href: zhUrl },
    ],
    ['link', { rel: 'alternate', hreflang: 'en', href: enUrl }],
    [
      'link',
      { rel: 'alternate', hreflang: 'x-default', href: zhUrl },
    ],

    ['meta', { name: 'keywords', content: KEYWORDS[locale] }],
    ['meta', { name: 'author', content: 'PeekShell' }],
    [
      'meta',
      {
        name: 'robots',
        content: 'index, follow, max-image-preview:large, max-snippet:-1',
      },
    ],

    ['meta', { property: 'og:type', content: isHome ? 'website' : 'article' }],
    ['meta', { property: 'og:site_name', content: SITE_NAME }],
    ['meta', { property: 'og:title', content: title }],
    ['meta', { property: 'og:description', content: description }],
    ['meta', { property: 'og:url', content: url }],
    ['meta', { property: 'og:image', content: OG_IMAGE }],
    ['meta', { property: 'og:image:alt', content: SITE_NAME }],
    [
      'meta',
      {
        property: 'og:locale',
        content: locale === 'zh' ? 'zh_CN' : 'en_US',
      },
    ],
    [
      'meta',
      {
        property: 'og:locale:alternate',
        content: locale === 'zh' ? 'en_US' : 'zh_CN',
      },
    ],

    ['meta', { name: 'twitter:card', content: 'summary_large_image' }],
    ['meta', { name: 'twitter:title', content: title }],
    ['meta', { name: 'twitter:description', content: description }],
    ['meta', { name: 'twitter:image', content: OG_IMAGE }],
  ]

  if (isHome) {
    head.push([
      'script',
      { type: 'application/ld+json' },
      JSON.stringify({
        '@context': 'https://schema.org',
        '@graph': [
          {
            '@type': 'WebSite',
            '@id': `${SITE_URL}/#website`,
            url: SITE_URL,
            name: SITE_NAME,
            description: DEFAULT_DESCRIPTION[locale],
            inLanguage: locale === 'zh' ? 'zh-CN' : 'en-US',
            publisher: { '@id': `${SITE_URL}/#organization` },
          },
          {
            '@type': 'Organization',
            '@id': `${SITE_URL}/#organization`,
            name: SITE_NAME,
            url: SITE_URL,
            logo: `${SITE_URL}/logo.png`,
            sameAs: ['https://github.com/openqmt/PeekShell'],
          },
          {
            '@type': 'SoftwareApplication',
            name: SITE_NAME,
            applicationCategory: 'DeveloperApplication',
            operatingSystem: 'Windows, macOS, Linux',
            description: DEFAULT_DESCRIPTION[locale],
            url: SITE_URL,
            downloadUrl: 'https://github.com/openqmt/PeekShell',
            offers: {
              '@type': 'Offer',
              price: '0',
              priceCurrency: 'USD',
            },
          },
        ],
      }),
    ])
  } else {
    head.push([
      'script',
      { type: 'application/ld+json' },
      JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'TechArticle',
        headline: title,
        description,
        url,
        inLanguage: locale === 'zh' ? 'zh-CN' : 'en-US',
        isPartOf: {
          '@type': 'WebSite',
          name: SITE_NAME,
          url: SITE_URL,
        },
        author: {
          '@type': 'Organization',
          name: SITE_NAME,
          url: SITE_URL,
        },
      }),
    ])
  }

  return head
}
