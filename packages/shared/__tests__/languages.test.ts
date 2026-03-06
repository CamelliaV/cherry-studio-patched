import { describe, expect, it } from 'vitest'

import { normalizeLanguage } from '../config/languages'

describe('normalizeLanguage', () => {
  it('keeps supported locales in canonical form', () => {
    expect(normalizeLanguage('ja-JP')).toBe('ja-JP')
    expect(normalizeLanguage('zh_CN')).toBe('zh-CN')
    expect(normalizeLanguage('EN-us')).toBe('en-US')
  })

  it('normalizes short and alias language codes used by browsers or legacy settings', () => {
    expect(normalizeLanguage('ja')).toBe('ja-JP')
    expect(normalizeLanguage('jp')).toBe('ja-JP')
    expect(normalizeLanguage('en')).toBe('en-US')
    expect(normalizeLanguage('es-MX')).toBe('es-ES')
    expect(normalizeLanguage('pt-BR')).toBe('pt-PT')
  })

  it('maps chinese variants to the nearest supported locale', () => {
    expect(normalizeLanguage('zh')).toBe('zh-CN')
    expect(normalizeLanguage('zh-Hans')).toBe('zh-CN')
    expect(normalizeLanguage('zh-SG')).toBe('zh-CN')
    expect(normalizeLanguage('zh-HK')).toBe('zh-TW')
    expect(normalizeLanguage('zh-Hant')).toBe('zh-TW')
    expect(normalizeLanguage('zh-MO')).toBe('zh-TW')
  })

  it('falls back to English for unsupported or empty values', () => {
    expect(normalizeLanguage(undefined)).toBe('en-US')
    expect(normalizeLanguage('')).toBe('en-US')
    expect(normalizeLanguage('pl-PL')).toBe('en-US')
  })
})
