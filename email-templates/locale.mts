import type { UiLocale } from '@ts-shared/languages/ui-locales'
import { emailCopy } from './catalog-copy.mts'

export function getLocalizedFooterText(uiLocale: UiLocale, year: string): string {
  return emailCopy(uiLocale, 'shared')('footer', { year })
}

export function getLocalizedSignoff(uiLocale: UiLocale): string {
  return emailCopy(uiLocale, 'shared')('signoff')
}
