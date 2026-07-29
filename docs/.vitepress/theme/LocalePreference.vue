<script setup lang="ts">
/**
 * Persist locale when the user switches language in the UI
 * so the next visit respects that choice over browser detection.
 */
import { watch } from 'vue'
import { useData } from 'vitepress'
import {
  localeFromLang,
  persistLocalePreference,
} from '../localePreference'

const { lang } = useData()

watch(
  lang,
  (next, prev) => {
    if (prev == null || next === prev) return
    persistLocalePreference(localeFromLang(next))
  },
)
</script>

<template></template>
