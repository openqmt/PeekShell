import type { DefaultTheme, LocaleSpecificConfig } from 'vitepress'

export const en: LocaleSpecificConfig<DefaultTheme.Config> = {
  lang: 'en-US',
  description: 'Lightweight cross-platform SSH client with a confirmation-first AI agent',

  themeConfig: {
    nav: [
      { text: 'Guide', link: '/en/guide/' },
      { text: 'GitHub', link: 'https://github.com/openqmt/PeekShell' },
    ],

    sidebar: {
      '/en/guide/': [
        {
          text: 'Getting started',
          items: [
            { text: 'Introduction', link: '/en/guide/' },
            { text: 'Quick start', link: '/en/guide/getting-started' },
          ],
        },
        {
          text: 'Usage',
          items: [
            { text: 'Hosts', link: '/en/guide/hosts' },
            { text: 'Terminal', link: '/en/guide/terminal' },
            { text: 'Remote files', link: '/en/guide/remote-explorer' },
            { text: 'AI assistant', link: '/en/guide/ai-agent' },
          ],
        },
      ],
    },

    outline: { label: 'On this page' },
    lastUpdated: { text: 'Last updated' },
    docFooter: { prev: 'Previous', next: 'Next' },
    darkModeSwitchLabel: 'Appearance',
    lightModeSwitchTitle: 'Switch to light mode',
    darkModeSwitchTitle: 'Switch to dark mode',
    sidebarMenuLabel: 'Menu',
    returnToTopLabel: 'Back to top',
    langMenuLabel: 'Change language',

    footer: {
      message: 'Built with Tauri 2 · Rust · Vue 3',
      copyright: 'Copyright © PeekShell',
    },
  },
}
