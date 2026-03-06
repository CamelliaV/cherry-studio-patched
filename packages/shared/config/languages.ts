import type { LanguageVarious } from '@types'

import { defaultLanguage } from './constant'

export const supportedUiLanguages: LanguageVarious[] = [
  'de-DE',
  'el-GR',
  'en-US',
  'es-ES',
  'fr-FR',
  'ja-JP',
  'pt-PT',
  'ro-RO',
  'ru-RU',
  'zh-CN',
  'zh-TW'
]

export const languageEnglishNameMap: Record<LanguageVarious, string> = {
  'de-DE': 'German',
  'el-GR': 'Greek',
  'en-US': 'English',
  'es-ES': 'Spanish',
  'fr-FR': 'French',
  'ja-JP': 'Japanese',
  'pt-PT': 'Portuguese',
  'ro-RO': 'Romanian',
  'ru-RU': 'Russian',
  'zh-CN': 'Chinese (Simplified)',
  'zh-TW': 'Chinese (Traditional)'
}

const canonicalLanguageMap = Object.fromEntries(
  supportedUiLanguages.map((language) => [language.toLowerCase(), language])
) as Record<string, LanguageVarious>

const baseLanguageMap: Record<string, LanguageVarious> = {
  de: 'de-DE',
  el: 'el-GR',
  en: 'en-US',
  es: 'es-ES',
  fr: 'fr-FR',
  ja: 'ja-JP',
  jp: 'ja-JP',
  pt: 'pt-PT',
  ro: 'ro-RO',
  ru: 'ru-RU',
  zh: 'zh-CN'
}

const directLanguageAliasMap: Record<string, LanguageVarious> = {
  'jp-jp': 'ja-JP',
  'pt-br': 'pt-PT',
  'zh-hans': 'zh-CN',
  'zh-sg': 'zh-CN',
  'zh-hant': 'zh-TW',
  'zh-hk': 'zh-TW',
  'zh-mo': 'zh-TW'
}

function normalizeLanguageTag(language?: string | null): string {
  return language?.trim().replace(/_/g, '-').toLowerCase() ?? ''
}

export function normalizeLanguage(language?: string | null): LanguageVarious {
  const normalizedLanguage = normalizeLanguageTag(language)

  if (!normalizedLanguage) {
    return defaultLanguage
  }

  if (canonicalLanguageMap[normalizedLanguage]) {
    return canonicalLanguageMap[normalizedLanguage]
  }

  if (directLanguageAliasMap[normalizedLanguage]) {
    return directLanguageAliasMap[normalizedLanguage]
  }

  if (normalizedLanguage.startsWith('zh-')) {
    const [, regionOrScript = ''] = normalizedLanguage.split('-', 2)
    return ['tw', 'hk', 'mo', 'hant'].includes(regionOrScript) ? 'zh-TW' : 'zh-CN'
  }

  const [baseLanguage] = normalizedLanguage.split('-', 1)
  return baseLanguageMap[baseLanguage] ?? defaultLanguage
}
