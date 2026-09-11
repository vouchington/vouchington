import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { renderWelcomeEmail } from './welcome-renderer.mts'
import WelcomeEmail from './welcome.tsx'

describe('renderWelcomeEmail', () => {
  it('renders the expected subject and snapshots', async () => {
    const result = await renderWelcomeEmail(WelcomeEmail.PreviewProps!)

    expect(result.subject).toBe('Welcome to Voucha — here\u2019s what you can do')
    await expect(result.html).toMatchFileSnapshot(
      fileURLToPath(new URL('__snapshots__/welcome.html', import.meta.url)),
    )
    await expect(result.text).toMatchFileSnapshot(
      fileURLToPath(new URL('__snapshots__/welcome.txt', import.meta.url)),
    )
  })

  it('includes the user name in both formats', async () => {
    const result = await renderWelcomeEmail({ userName: 'Jordan' })

    expect(result.html).toContain('Jordan')
    expect(result.text).toContain('Jordan')
  })

  it('renders a localized greeting with no English fallback when no user name is provided', async () => {
    const cases = [
      { uiLocale: 'en', expected: 'Welcome to Voucha!' },
      { uiLocale: 'es', expected: '¡Bienvenido a Voucha!' },
      { uiLocale: 'fr', expected: 'Bienvenue sur Voucha !' },
      { uiLocale: 'pt', expected: 'Bem-vindo à Voucha!' },
    ] as const

    for (const { uiLocale, expected } of cases) {
      const result = await renderWelcomeEmail({ userName: undefined, uiLocale })

      expect(result.text).toContain(expected)
      expect(result.text).not.toContain('there')
    }
  })
})
