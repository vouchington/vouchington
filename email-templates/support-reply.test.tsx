import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { renderSupportReplyEmail } from './support-reply-renderer.mts'
import SupportReplyEmail from './support-reply.tsx'

describe('renderSupportReplyEmail', () => {
  it('renders the expected subject and snapshots', async () => {
    const result = await renderSupportReplyEmail(SupportReplyEmail.PreviewProps!)

    expect(result.subject).toBe('Re: Your support request')
    await expect(result.html).toMatchFileSnapshot(
      fileURLToPath(new URL('__snapshots__/support-reply.html', import.meta.url)),
    )
    await expect(result.text).toMatchFileSnapshot(
      fileURLToPath(new URL('__snapshots__/support-reply.txt', import.meta.url)),
    )
  })

  it.each([
    ['en', 'Re: Your support request', 'A message from Voucha Support', '- Voucha Support Team'],
    [
      'es',
      'Re: Tu solicitud de soporte',
      'Un mensaje del equipo de soporte de Voucha',
      '- El equipo de soporte de Voucha',
    ],
    [
      'fr',
      'Re: Votre demande d’assistance',
      "Un message de l'équipe d'assistance Voucha",
      "- L'équipe d'assistance Voucha",
    ],
    [
      'pt',
      'Re: Sua solicitação de suporte',
      'Uma mensagem da equipe de suporte da Voucha',
      '- Equipe de suporte da Voucha',
    ],
  ] as const)(
    'localizes support reply shell copy for %s',
    async (uiLocale, subject, preview, signoff) => {
      const result = await renderSupportReplyEmail({
        bodyText: 'First line\n\nSecond line',
        uiLocale,
      })
      const html = result.html.replaceAll('&#x27;', "'")

      expect(result.subject).toBe(subject)
      expect(html).toContain(preview)
      expect(html).toContain(signoff)
      expect(result.text).toBe(`First line\n\nSecond line\n\n${signoff}`)
    },
  )

  it('uses the caller-provided support subject when present', async () => {
    const result = await renderSupportReplyEmail({
      bodyText: 'Thanks for the details.',
      subject: 'Case #123',
      uiLocale: 'es',
    })

    expect(result.subject).toBe('Case #123')
  })

  it('uses the support signature without an em dash', async () => {
    const result = await renderSupportReplyEmail({
      bodyText: 'Thanks for writing in.',
    })

    expect(result.html).toContain('- Voucha Support Team')
    expect(result.text).toContain('- Voucha Support Team')
    expect(result.text).not.toContain('—')
  })
})
