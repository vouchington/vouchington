import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { renderCrmOutreachEmail } from './crm-outreach-renderer.mts'
import CrmOutreachEmail from './crm-outreach.tsx'

const unsubscribeUrl = 'https://voucha.ai/my/notification-settings'
const physicalAddress = '123 Placeholder St, Suite 100, San Francisco, CA 94105'

describe('renderCrmOutreachEmail', () => {
  it('renders the expected subject and snapshots', async () => {
    const result = await renderCrmOutreachEmail(CrmOutreachEmail.PreviewProps!)

    expect(result.subject).toBe('A message from John')
    await expect(result.html).toMatchFileSnapshot(
      fileURLToPath(new URL('__snapshots__/crm-outreach.html', import.meta.url)),
    )
    await expect(result.text).toMatchFileSnapshot(
      fileURLToPath(new URL('__snapshots__/crm-outreach.txt', import.meta.url)),
    )
  })

  it('injects bodyHtml into the HTML output (not stripped)', async () => {
    const result = await renderCrmOutreachEmail({
      contactName: 'Alice',
      senderName: 'Bob',
      bodyHtml: '<p>Hello from <strong>Bob</strong>!</p>',
      unsubscribeUrl,
      physicalAddress,
    })

    expect(result.html).toContain('<p>Hello from <strong>Bob</strong>!</p>')
  })

  it('strips HTML tags in text output', async () => {
    const result = await renderCrmOutreachEmail({
      contactName: 'Alice',
      senderName: 'Bob',
      bodyHtml: '<p>Hello from <strong>Bob</strong>!</p>',
      unsubscribeUrl,
      physicalAddress,
    })

    expect(result.text).toContain('Hello from')
    expect(result.text).toContain('Bob')
    expect(result.text).not.toContain('<p>')
    expect(result.text).not.toContain('<strong>')
  })

  it('includes contact name greeting', async () => {
    const result = await renderCrmOutreachEmail({
      contactName: 'Alice',
      senderName: 'Bob',
      bodyHtml: '<p>Content</p>',
      unsubscribeUrl,
      physicalAddress,
    })

    expect(result.html).toContain('Hi Alice,')
    expect(result.text).toContain('Hi Alice,')
  })

  it('includes sender name in subject and signature', async () => {
    const result = await renderCrmOutreachEmail({
      contactName: 'Alice',
      senderName: 'Bob',
      bodyHtml: '<p>Content</p>',
      unsubscribeUrl,
      physicalAddress,
    })

    expect(result.subject).toBe('A message from Bob')
    expect(result.text).toContain('Bob')
  })

  it('includes CTA URL in text output when provided', async () => {
    const result = await renderCrmOutreachEmail({
      contactName: 'Alice',
      senderName: 'Bob',
      bodyHtml: '<p>Content</p>',
      ctaUrl: 'https://voucha.ai/deal',
      ctaLabel: 'View Deal',
      unsubscribeUrl,
      physicalAddress,
    })

    expect(result.text).toContain('View Deal: https://voucha.ai/deal')
    expect(result.html).toContain('https://voucha.ai/deal')
  })

  it('uses default CTA label when ctaLabel is not provided', async () => {
    const result = await renderCrmOutreachEmail({
      contactName: 'Alice',
      senderName: 'Bob',
      bodyHtml: '<p>Content</p>',
      ctaUrl: 'https://voucha.ai',
      unsubscribeUrl,
      physicalAddress,
    })

    expect(result.text).toContain('Learn More: https://voucha.ai')
  })

  it.each([
    ['es', 'Un mensaje de Bob', 'Hola Alice,', 'Saludos,\nBob', 'Más información'],
    ['fr', 'Un message de Bob', 'Bonjour Alice,', 'Cordialement,\nBob', 'En savoir plus'],
    ['pt', 'Uma mensagem de Bob', 'Olá Alice,', 'Atenciosamente,\nBob', 'Saiba mais'],
  ] as const)(
    'localizes shell copy for %s without translating the authored body',
    async (uiLocale, subject, greeting, signoff, ctaLabel) => {
      const result = await renderCrmOutreachEmail({
        contactName: 'Alice',
        senderName: 'Bob',
        bodyHtml: '<p>Content</p>',
        ctaUrl: 'https://voucha.ai',
        unsubscribeUrl,
        physicalAddress,
        uiLocale,
      })

      expect(result.subject).toBe(subject)
      expect(result.text).toContain(greeting)
      expect(result.text).toContain(signoff)
      expect(result.text).toContain(`Content\n\n${ctaLabel}: https://voucha.ai`)
    },
  )

  it('omits CTA from text when ctaUrl is not provided', async () => {
    const result = await renderCrmOutreachEmail({
      contactName: 'Alice',
      senderName: 'Bob',
      bodyHtml: '<p>Content</p>',
      unsubscribeUrl,
      physicalAddress,
    })

    expect(result.text).not.toContain('Learn More:')
  })

  it('includes image in HTML when imageUrl is provided', async () => {
    const result = await renderCrmOutreachEmail({
      contactName: 'Alice',
      senderName: 'Bob',
      bodyHtml: '<p>Content</p>',
      imageUrl: 'https://cdn.voucha.ai/banner.jpg',
      unsubscribeUrl,
      physicalAddress,
    })

    expect(result.html).toContain('https://cdn.voucha.ai/banner.jpg')
  })

  it('includes the unsubscribe link and physical address in html and text', async () => {
    const result = await renderCrmOutreachEmail({
      contactName: 'Alice',
      senderName: 'Bob',
      bodyHtml: '<p>Content</p>',
      unsubscribeUrl,
      physicalAddress,
    })

    // React Email's pretty-printer can wrap long text nodes across lines, so
    // collapse whitespace before asserting on the multi-word address.
    const normalizedHtml = result.html.replace(/\s+/g, ' ')
    expect(normalizedHtml).toContain(unsubscribeUrl)
    expect(normalizedHtml).toContain(physicalAddress)
    expect(result.text).toContain(unsubscribeUrl)
    expect(result.text).toContain(physicalAddress)
  })
})
