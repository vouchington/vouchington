import { describe, expect, it } from 'vitest'
import { getLocalizedFooterText, getLocalizedSignoff } from './locale.mts'

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
