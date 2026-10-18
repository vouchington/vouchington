import { resolveEmailLocale } from '@vouchington/email'

import { SUPPORTED_UI_LOCALES, DEFAULT_UI_LOCALE } from '@ts-shared/languages/ui-locales'
import { describe, expect, it } from 'vitest'
import { getLocalizedFooterText, getLocalizedSignoff } from './locale.mts'

describe('Voucha email locales', () => {
  it.each([
    ['pt-BR', 'pt'],
    ['fr_CA', 'fr'],
    ['es-MX', 'es'],
    ['de-DE', 'en'],
    [null, 'en'],
  ] as const)('normalizes %s to %s', (input, expected) => {
    expect(resolveEmailLocale(input, SUPPORTED_UI_LOCALES, DEFAULT_UI_LOCALE)).toBe(expected)
  })
})

describe('shared catalog helpers', () => {
  it.each([
    ['en', '© 2026 Voucha. All rights reserved.', '- The Voucha Team'],
    ['es', '© 2026 Voucha. Todos los derechos reservados.', '- El equipo de Voucha'],
    ['fr', '© 2026 Voucha. Tous droits réservés.', "- L'équipe Voucha"],
    ['pt', '© 2026 Voucha. Todos os direitos reservados.', '- A equipe Voucha'],
  ] as const)('owns %s footer and signoff copy', (locale, footer, signoff) => {
    expect(getLocalizedFooterText(locale, '2026')).toBe(footer)
    expect(getLocalizedSignoff(locale)).toBe(signoff)
  })
})
