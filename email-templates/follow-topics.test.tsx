import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { renderFollowTopicsEmail } from './follow-topics-renderer.mts'
import FollowTopicsEmail from './follow-topics.tsx'

describe('renderFollowTopicsEmail', () => {
  it('renders the expected subject and snapshots', async () => {
    const result = await renderFollowTopicsEmail(FollowTopicsEmail.PreviewProps!)

    expect(result.subject).toBe('Topics from people you trust')
    await expect(result.html).toMatchFileSnapshot(
      fileURLToPath(new URL('__snapshots__/follow-topics.html', import.meta.url)),
    )
    await expect(result.text).toMatchFileSnapshot(
      fileURLToPath(new URL('__snapshots__/follow-topics.txt', import.meta.url)),
    )
  })

  it('includes the topic reason in both formats', async () => {
    const result = await renderFollowTopicsEmail({
      userName: 'Jordan',
      topics: [
        {
          name: 'Travel',
          url: 'https://voucha.ai/topics/travel',
          reason: 'Your circle follows this topic often.',
        },
      ],
      settingsUrl: 'https://voucha.ai/my/topics/following',
      unsubscribeUrl: 'https://voucha.ai/my/notification-settings',
      physicalAddress: '123 Placeholder St, Suite 100, San Francisco, CA 94105',
    })

    expect(result.html).toContain('Your circle follows this topic often.')
    expect(result.text).toContain('Your circle follows this topic often.')
  })

  it('falls back to the locale greeting when no user name is provided', async () => {
    for (const [uiLocale, greeting, fallbackReason] of [
      ['es', 'Hola,', 'Abre el tema y síguelo.'],
      ['fr', 'Bonjour,', 'Ouvrez le sujet et suivez-le.'],
      ['pt', 'Olá,', 'Abra o tópico e siga-o.'],
    ] as const) {
      const result = await renderFollowTopicsEmail({
        userName: undefined,
        topics: [
          {
            name: 'Travel',
            url: 'https://voucha.ai/topics/travel',
          },
        ],
        settingsUrl: 'https://voucha.ai/my/topics/following',
        unsubscribeUrl: 'https://voucha.ai/my/notification-settings',
        physicalAddress: '123 Placeholder St, Suite 100, San Francisco, CA 94105',
        uiLocale,
      })

      expect(result.text).toContain(greeting)
      expect(result.text).toContain(fallbackReason)
    }
  })
})
