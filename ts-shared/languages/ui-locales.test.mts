import { describe, expect, it } from 'vitest'
import {
  DEFAULT_UI_LOCALE,
  normalizeUiLocale,
  SUPPORTED_UI_LOCALES,
  UI_LOCALE_SELECT_OPTIONS,
} from './ui-locales.mts'

describe('ui locale helpers', () => {
  it('supports only explicit UI catalog locales', () => {
    expect(DEFAULT_UI_LOCALE).toBe('en')
    expect(SUPPORTED_UI_LOCALES).toEqual(['en', 'es', 'fr', 'pt'])
    expect(UI_LOCALE_SELECT_OPTIONS).toEqual([
      { value: 'en', label: 'English' },
      { value: 'es', label: 'Español' },
      { value: 'fr', label: 'Français' },
      { value: 'pt', label: 'Português' },
    ])
  })

  it('normalizes supported UI locales', () => {
    expect(normalizeUiLocale('EN')).toBe('en')
    expect(normalizeUiLocale('en-US')).toBe('en')
    expect(normalizeUiLocale('FR')).toBe('fr')
    expect(normalizeUiLocale('es-MX')).toBe('es')
    expect(normalizeUiLocale('pt-BR')).toBe('pt')
    expect(normalizeUiLocale('de')).toBeNull()
  })
})
