import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { renderFollowNewsSourcesEmail } from './follow-news-sources-renderer.mts'
import FollowNewsSourcesEmail from './follow-news-sources.tsx'

describe('renderFollowNewsSourcesEmail', () => {
  it('renders the expected subject and snapshots', async () => {
    const result = await renderFollowNewsSourcesEmail(FollowNewsSourcesEmail.PreviewProps!)

    expect(result.subject).toBe('News sources from people you trust')
    await expect(result.html).toMatchFileSnapshot(
      fileURLToPath(new URL('__snapshots__/follow-news-sources.html', import.meta.url)),
    )
    await expect(result.text).toMatchFileSnapshot(
      fileURLToPath(new URL('__snapshots__/follow-news-sources.txt', import.meta.url)),
    )
  })

  it('includes the source description in both formats', async () => {
    const result = await renderFollowNewsSourcesEmail({
      userName: 'Jordan',
      sources: [
        {
          name: 'The Verge',
          url: 'https://voucha.ai/sources/the-verge',
          description: 'Tech news your circle watches.',
        },
      ],
      settingsUrl: 'https://voucha.ai/my/notification-settings',
      unsubscribeUrl: 'https://voucha.ai/my/notification-settings',
      physicalAddress: '123 Placeholder St, Suite 100, San Francisco, CA 94105',
    })

    expect(result.html).toContain('Tech news your circle watches.')
    expect(result.text).toContain('Tech news your circle watches.')
  })

  it('falls back to the locale greeting when no user name is provided', async () => {
    for (const [uiLocale, greeting, fallbackDescription] of [
      ['es', 'Hola,', 'Abre la fuente y síguela.'],
      ['fr', 'Bonjour,', 'Ouvrez la source et suivez-la.'],
      ['pt', 'Olá,', 'Abra a fonte e siga-a.'],
    ] as const) {
      const result = await renderFollowNewsSourcesEmail({
        userName: undefined,
        sources: [
          {
            name: 'NPR',
            url: 'https://voucha.ai/sources/npr',
          },
        ],
        settingsUrl: 'https://voucha.ai/my/notification-settings',
        unsubscribeUrl: 'https://voucha.ai/my/notification-settings',
        physicalAddress: '123 Placeholder St, Suite 100, San Francisco, CA 94105',
        uiLocale,
      })

      expect(result.text).toContain(greeting)
      expect(result.text).toContain(fallbackDescription)
    }
  })
})
