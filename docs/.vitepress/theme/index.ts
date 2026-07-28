import { h } from 'vue'
import DefaultTheme from 'vitepress/theme'
import SiteNoteModal from './components/SiteNoteModal.vue'
import './custom.css'

export default {
  extends: DefaultTheme,
  Layout() {
    return h(DefaultTheme.Layout, null, {
      'layout-bottom': () => h(SiteNoteModal),
    })
  },
}
