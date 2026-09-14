import {
  DEFAULT_UI_LOCALE,
  normalizeUiLocale,
  type UiLocale,
} from '@ts-shared/languages/ui-locales'
import { emailCopy } from './catalog-copy.mts'

export type { UiLocale }

export function resolveUiLocale(uiLocale: UiLocale | string | null | undefined): UiLocale {
  return normalizeUiLocale(uiLocale) ?? DEFAULT_UI_LOCALE
}

export function getLocalizedFooterText(uiLocale: UiLocale, year: string): string {
  return emailCopy(uiLocale, 'shared')('footer', { year })
}

export function getLocalizedSignoff(uiLocale: UiLocale): string {
  return emailCopy(uiLocale, 'shared')('signoff')
}
