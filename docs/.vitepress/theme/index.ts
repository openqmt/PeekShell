import { h } from 'vue'
import DefaultTheme from 'vitepress/theme'
import DownloadPage from '../../components/DownloadPage.vue'
import SiteNoteModal from '../../components/SiteNoteModal.vue'
import LocalePreference from './LocalePreference.vue'
import './custom.css'

export default {
  extends: DefaultTheme,
  enhanceApp({ app }) {
    app.component('DownloadPage', DownloadPage)
  },
  Layout() {
    return h(DefaultTheme.Layout, null, {
      'layout-bottom': () => [h(LocalePreference), h(SiteNoteModal)],
    })
  },
}
