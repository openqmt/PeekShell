import fs from 'node:fs'
import path from 'node:path'
import { defineConfig } from 'vitepress'
import {
  DEFAULT_DESCRIPTION,
  SITE_NAME,
  SITE_URL,
  buildSeoHead,
} from './seo'

function sitemapLocaleLinks(url: string) {
  const pathName = url.startsWith('/') ? url : `/${url}`

  let zh = pathName
  let en = pathName

  if (pathName === '/' || pathName === '') {
    zh = '/'
    en = '/en/'
  } else if (pathName === '/en' || pathName === '/en/') {
    zh = '/'
    en = '/en/'
  } else if (pathName.startsWith('/en/')) {
    zh = pathName.slice(3) || '/'
    en = pathName
  } else {
    zh = pathName
    en = `/en${pathName}`
  }

  return [
    { lang: 'zh-CN', url: `${SITE_URL}${zh === '/' ? '/' : zh}` },
    { lang: 'en', url: `${SITE_URL}${en}` },
  ]
}

export const shared = defineConfig({
  title: SITE_NAME,
  titleTemplate: ':title · PeekShell',
  description: DEFAULT_DESCRIPTION.zh,
  cleanUrls: true,
  lastUpdated: true,

  sitemap: {
    hostname: SITE_URL,
    transformItems: (items) =>
      items.map((item) => ({
        ...item,
        links: sitemapLocaleLinks(item.url),
      })),
  },

  head: [
    ['link', { rel: 'icon', type: 'image/png', href: '/favicon.png' }],
    ['link', { rel: 'apple-touch-icon', href: '/logo.png' }],
    ['meta', { name: 'theme-color', content: '#0f766e' }],
    ['meta', { name: 'application-name', content: SITE_NAME }],
  ],

  transformHead(ctx) {
    return buildSeoHead(ctx)
  },

  buildEnd(siteConfig) {
    const robots = [
      'User-agent: *',
      'Allow: /',
      '',
      `Sitemap: ${SITE_URL}/sitemap.xml`,
      '',
    ].join('\n')
    fs.writeFileSync(path.join(siteConfig.outDir, 'robots.txt'), robots)
  },

  themeConfig: {
    logo: { src: '/app-icon.png', width: 24, height: 24 },
    socialLinks: [
      { icon: 'github', link: 'https://github.com/openqmt/PeekShell' },
    ],
    search: {
      provider: 'local',
      options: {
        locales: {
          root: {
            translations: {
              button: {
                buttonText: '搜索',
                buttonAriaLabel: '搜索文档',
              },
              modal: {
                displayDetails: '显示详细列表',
                resetButtonTitle: '清除查询条件',
                backButtonTitle: '关闭搜索',
                noResultsText: '无法找到相关结果',
                footer: {
                  selectText: '选择',
                  navigateText: '切换',
                  closeText: '关闭',
                },
              },
            },
          },
          en: {
            translations: {
              button: {
                buttonText: 'Search',
                buttonAriaLabel: 'Search docs',
              },
              modal: {
                displayDetails: 'Display detailed list',
                resetButtonTitle: 'Reset search',
                backButtonTitle: 'Close search',
                noResultsText: 'No results found',
                footer: {
                  selectText: 'to select',
                  navigateText: 'to navigate',
                  closeText: 'to close',
                },
              },
            },
          },
        },
      },
    },
  },
})
