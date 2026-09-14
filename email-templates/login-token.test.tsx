import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { emailCopy } from './catalog-copy.mts'
import { renderLoginTokenEmail } from './login-token-renderer.mts'
import LoginTokenEmail from './login-token.tsx'

describe('renderLoginTokenEmail', () => {
  it.each([
    ['en', 'Your Voucha One-Time Password Login'],
    ['es', 'Tu inicio de sesión con contraseña de un solo uso de Voucha'],
    ['fr', 'Votre connexion Voucha par mot de passe à usage unique'],
    ['pt', 'Seu login da Voucha com senha de uso único'],
  ] as const)('owns the %s subject in the catalog', (locale, subject) => {
    expect(emailCopy(locale, 'login-token')('subject')).toBe(subject)
  })

  it('uses a production-shaped preview token', () => {
    expect(LoginTokenEmail.PreviewProps!.token).toMatch(/^[0-9A-F]{8}$/)
  })

  it('renders the expected subject and snapshots', async () => {
    const result = await renderLoginTokenEmail(LoginTokenEmail.PreviewProps!)

    expect(result.subject).toBe('Your Voucha One-Time Password Login')
    await expect(result.html).toMatchFileSnapshot(
      fileURLToPath(new URL('__snapshots__/login-token.html', import.meta.url)),
    )
    await expect(result.text).toMatchFileSnapshot(
      fileURLToPath(new URL('__snapshots__/login-token.txt', import.meta.url)),
    )
  })

  it('includes the encoded login URL and token in both formats', async () => {
    const token = 'ABC12345'
    const result = await renderLoginTokenEmail({
      emailAddress: 'tests+user-preview@voucha.ai',
      token,
      expiration: '15 minutes',
    })

    const encodedEmail = encodeURIComponent('tests+user-preview@voucha.ai')
    const escapedToken = RegExp.escape(token)

    expect(result.html).toContain(`emailAddress=${encodedEmail}`)
    expect(result.html).toContain(`otp=${token}`)
    expect(result.html).toContain('Or use this one-time password:')
    expect(result.html).toMatch(
      new RegExp(
        `Or use this one-time password:[\\s\\S]*${escapedToken}[\\s\\S]*This token will expire`,
      ),
    )
    expect(result.html).toContain('If the button does not work, use this URL:')
    expect(result.text).toContain(`emailAddress=${encodedEmail}`)
    expect(result.text).toContain(`otp=${token}`)
    expect(result.text).toContain(`one-time password:\n\n${token}\n\nThis token will expire`)
  })

  it('renders localized Spanish copy when requested', async () => {
    const result = await renderLoginTokenEmail({
      emailAddress: 'tests+user-preview@voucha.ai',
      token: 'ABC12345',
      expiration: '15 minutes',
      uiLocale: 'es',
    })

    expect(result.subject).toBe('Tu inicio de sesión con contraseña de un solo uso de Voucha')
    expect(result.html).toContain('O usa esta contraseña de un solo uso:')
    expect(result.html).toContain('15 minutos')
    expect(result.text).toContain('Este código expirará en 15 minutos.')
    expect(result.text).toContain('El equipo de Voucha')
  })

  it('keeps a caller-supplied expiration label', async () => {
    const result = await renderLoginTokenEmail({
      emailAddress: 'tests+user-preview@voucha.ai',
      token: 'ABC12345',
      expiration: '1 hour',
    })

    expect(result.html).toContain('1 hour')
    expect(result.text).toContain('This token will expire in 1 hour.')
  })
})
