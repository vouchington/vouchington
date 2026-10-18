import { resolveEmailLocale } from '@vouchington/email'

import { SUPPORTED_UI_LOCALES, DEFAULT_UI_LOCALE } from '@ts-shared/languages/ui-locales'
import { emailCopy } from './catalog-copy.mts'

import { createRecommendationEmail } from './recommendation-email.tsx'
import type { FollowNewsSourcesEmailProps } from './types.mts'

const FollowNewsSourcesEmail = createRecommendationEmail(
  ({ sources, uiLocale, ...props }: FollowNewsSourcesEmailProps) => {
    const locale = resolveEmailLocale(uiLocale, SUPPORTED_UI_LOCALES, DEFAULT_UI_LOCALE)
    const t = emailCopy(locale, 'follow-news-sources')
    return {
      ...props,
      locale,
      t,
      recommendations: sources.map(source => ({
        name: source.name,
        url: source.url,
        detail: source.description ?? t('fallbackDescription'),
      })),
    }
  },
)

FollowNewsSourcesEmail.PreviewProps = {
  userName: 'Alex',
  sources: [
    {
      name: 'The Verge',
      url: 'https://voucha.ai/sources/the-verge',
      description: 'Tech news your circle watches.',
    },
    {
      name: 'NPR',
      url: 'https://voucha.ai/sources/npr',
    },
  ],
  settingsUrl: 'https://voucha.ai/my/notification-settings',
  unsubscribeUrl: 'https://voucha.ai/my/notification-settings',
  physicalAddress: '123 Placeholder St, Suite 100, San Francisco, CA 94105',
}

export default FollowNewsSourcesEmail
