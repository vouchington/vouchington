import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { renderPostReferralLinkEmail } from './post-referral-link-renderer.mts'
import PostReferralLinkEmail from './post-referral-link.tsx'

describe('renderPostReferralLinkEmail', () => {
  it('renders the expected subject and snapshots', async () => {
    const result = await renderPostReferralLinkEmail(PostReferralLinkEmail.PreviewProps!)

    expect(result.subject).toBe('Referral links from your circle')
    await expect(result.html).toMatchFileSnapshot(
      fileURLToPath(new URL('__snapshots__/post-referral-link.html', import.meta.url)),
    )
    await expect(result.text).toMatchFileSnapshot(
      fileURLToPath(new URL('__snapshots__/post-referral-link.txt', import.meta.url)),
    )
  })

  it('includes active link counts in both formats', async () => {
    const result = await renderPostReferralLinkEmail({
      userName: 'Jordan',
      referralPrograms: [
        {
          name: 'Travel Cards',
          url: 'https://voucha.ai/referral-programs/travel-cards',
          linkCount: 2,
        },
      ],
      settingsUrl: 'https://voucha.ai/my/landing-pages',
      unsubscribeUrl: 'https://voucha.ai/my/notification-settings',
      physicalAddress: '123 Placeholder St, Suite 100, San Francisco, CA 94105',
    })

    expect(result.html).toContain('2 active links')
    expect(result.text).toContain('2 active links')
  })

  it('falls back to the locale greeting and link-count copy when values are omitted', async () => {
    for (const [uiLocale, greeting, fallbackCount, activeLink] of [
      ['es', 'Hola,', 'Abre el programa y actualiza tus enlaces.', '1 enlace activo'],
      ['fr', 'Bonjour,', 'Ouvrez le programme et mettez vos liens à jour.', '1 lien actif'],
      ['pt', 'Olá,', 'Abra o programa e atualize seus links.', '1 link ativo'],
    ] as const) {
      const result = await renderPostReferralLinkEmail({
        userName: undefined,
        referralPrograms: [
          {
            name: 'Travel Cards',
            url: 'https://voucha.ai/referral-programs/travel-cards',
          },
          {
            name: 'Food Delivery',
            url: 'https://voucha.ai/referral-programs/food-delivery',
            linkCount: 1,
          },
        ],
        settingsUrl: 'https://voucha.ai/my/landing-pages',
        unsubscribeUrl: 'https://voucha.ai/my/notification-settings',
        physicalAddress: '123 Placeholder St, Suite 100, San Francisco, CA 94105',
        uiLocale,
      })

      expect(result.text).toContain(greeting)
      expect(result.text).toContain(fallbackCount)
      expect(result.text).toContain(activeLink)
    }
  })
})
