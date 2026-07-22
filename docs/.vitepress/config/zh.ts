import type { DefaultTheme, LocaleSpecificConfig } from 'vitepress'

export const zh: LocaleSpecificConfig<DefaultTheme.Config> = {
  lang: 'zh-CN',
  description: '轻量跨平台 SSH 客户端，内置确认式 AI Agent',

  themeConfig: {
    nav: [
      { text: '指南', link: '/guide/' },
      { text: 'GitHub', link: 'https://github.com/openqmt/PeekShell' },
    ],

    sidebar: {
      '/guide/': [
        {
          text: '开始',
          items: [
            { text: '介绍', link: '/guide/' },
            { text: '快速开始', link: '/guide/getting-started' },
          ],
        },
        {
          text: '使用',
          items: [
            { text: '主机管理', link: '/guide/hosts' },
            { text: '终端', link: '/guide/terminal' },
            { text: '远程文件', link: '/guide/remote-explorer' },
            { text: 'AI 助手', link: '/guide/ai-agent' },
          ],
        },
      ],
    },

    outline: { label: '本页目录' },
    lastUpdated: { text: '最后更新于' },
    docFooter: { prev: '上一页', next: '下一页' },
    darkModeSwitchLabel: '外观',
    lightModeSwitchTitle: '切换到浅色模式',
    darkModeSwitchTitle: '切换到深色模式',
    sidebarMenuLabel: '菜单',
    returnToTopLabel: '回到顶部',
    langMenuLabel: '切换语言',

    footer: {
      message: '基于 Tauri 2 · Rust · Vue 3 构建',
      copyright: 'Copyright © PeekShell',
    },
  },
}
