import {
  DEFAULT_UI_LOCALE,
  normalizeUiLocale,
  type UiLocale,
} from '@ts-shared/languages/ui-locales'

export type { UiLocale }

export function resolveUiLocale(uiLocale: UiLocale | string | null | undefined): UiLocale {
  return normalizeUiLocale(uiLocale) ?? DEFAULT_UI_LOCALE
}

const footerByLocale: Record<UiLocale, string> = {
  en: '© {year} Voucha. All rights reserved.',
  es: '© {year} Voucha. Todos los derechos reservados.',
  fr: '© {year} Voucha. Tous droits réservés.',
  pt: '© {year} Voucha. Todos os direitos reservados.',
}

export function getLocalizedFooterText(uiLocale: UiLocale, year: string): string {
  return footerByLocale[uiLocale].replace('{year}', year)
}

const signoffByLocale: Record<UiLocale, string> = {
  en: '- The Voucha Team',
  es: '- El equipo de Voucha',
  fr: "- L'équipe Voucha",
  pt: '- A equipe Voucha',
}

export function getLocalizedSignoff(uiLocale: UiLocale): string {
  return signoffByLocale[uiLocale]
}
