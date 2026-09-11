import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { renderEmailVerificationEmail } from './email-verification-renderer.mts'
import EmailVerificationEmail from './email-verification.tsx'

describe('renderEmailVerificationEmail', () => {
  it('renders the expected subject and snapshots', async () => {
    const result = await renderEmailVerificationEmail(EmailVerificationEmail.PreviewProps!)

    expect(result.subject).toBe('Verify Your Email Address')
    await expect(result.html).toMatchFileSnapshot(
      fileURLToPath(new URL('__snapshots__/email-verification.html', import.meta.url)),
    )
    await expect(result.text).toMatchFileSnapshot(
      fileURLToPath(new URL('__snapshots__/email-verification.txt', import.meta.url)),
    )
  })

  it('includes the verification token without adding a verification link', async () => {
    const result = await renderEmailVerificationEmail({
      token: 'verify456',
    })

    expect(result.html).toContain('verify456')
    expect(result.html.toLowerCase()).toContain('verification code')
    expect(result.html).not.toContain('/verify-email')
    expect(result.text).toContain('verify456')
    expect(result.text).not.toContain('/verify-email')
  })

  it('renders localized Portuguese copy when requested', async () => {
    const result = await renderEmailVerificationEmail({
      token: 'verify456',
      uiLocale: 'pt',
    })

    expect(result.subject).toBe('Verifique seu endereço de email')
    expect(result.html).toContain('Digite o código de verificação abaixo')
    expect(result.text).toContain('A equipe Voucha')
  })
})
