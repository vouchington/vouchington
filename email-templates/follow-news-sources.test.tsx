import { describe } from 'vitest'
import { renderFollowNewsSourcesEmail } from './follow-news-sources-renderer.mts'
import FollowNewsSourcesEmail from './follow-news-sources.tsx'
import { registerRecommendationEmailRenderTests } from './test-helpers/recommendation-email-render-tests.mts'

const settingsUrl = 'https://voucha.ai/my/notification-settings'

describe('renderFollowNewsSourcesEmail', () => {
  registerRecommendationEmailRenderTests({
    render: renderFollowNewsSourcesEmail,
    previewProps: FollowNewsSourcesEmail.PreviewProps!,
    subject: 'News sources from people you trust',
    snapshotStem: 'follow-news-sources',
    testModuleUrl: import.meta.url,
    includedCopy: {
      props: {
        userName: 'Jordan',
        sources: [
          {
            name: 'The Verge',
            url: 'https://voucha.ai/sources/the-verge',
            description: 'Tech news your circle watches.',
          },
        ],
        settingsUrl,
      },
      fragments: ['Tech news your circle watches.'] as const,
    },
    omittedValues: {
      props: uiLocale => ({
        userName: undefined,
        sources: [{ name: 'NPR', url: 'https://voucha.ai/sources/npr' }],
        settingsUrl,
        uiLocale,
      }),
      rows: [
        ['es', 'Hola,', 'Abre la fuente y síguela.'],
        ['fr', 'Bonjour,', 'Ouvrez la source et suivez-la.'],
        ['pt', 'Olá,', 'Abra a fonte e siga-a.'],
      ] as const,
    },
  })
})
