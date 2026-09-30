import { describe } from 'vitest'
import { renderFollowTopicsEmail } from './follow-topics-renderer.mts'
import FollowTopicsEmail from './follow-topics.tsx'
import { registerRecommendationEmailRenderTests } from './test-helpers/recommendation-email-render-tests.mts'

const settingsUrl = 'https://voucha.ai/my/topics/following'

describe('renderFollowTopicsEmail', () => {
  registerRecommendationEmailRenderTests({
    render: renderFollowTopicsEmail,
    previewProps: FollowTopicsEmail.PreviewProps!,
    subject: 'Topics from people you trust',
    snapshotStem: 'follow-topics',
    testModuleUrl: import.meta.url,
    includedCopy: {
      props: {
        userName: 'Jordan',
        topics: [
          {
            name: 'Travel',
            url: 'https://voucha.ai/topics/travel',
            reason: 'Your circle follows this topic often.',
          },
        ],
        settingsUrl,
      },
      fragments: ['Your circle follows this topic often.'] as const,
    },
    omittedValues: {
      props: uiLocale => ({
        userName: undefined,
        topics: [{ name: 'Travel', url: 'https://voucha.ai/topics/travel' }],
        settingsUrl,
        uiLocale,
      }),
      rows: [
        ['es', 'Hola,', 'Abre el tema y síguelo.'],
        ['fr', 'Bonjour,', 'Ouvrez le sujet et suivez-le.'],
        ['pt', 'Olá,', 'Abra o tópico e siga-o.'],
      ] as const,
    },
  })
})
