import { emailCopy } from './catalog-copy.mts'
import { resolveUiLocale } from './locale.mts'
import { createRecommendationEmail } from './recommendation-email.tsx'
import type { FollowTopicsEmailProps } from './types.mts'

const FollowTopicsEmail = createRecommendationEmail(
  ({ topics, uiLocale, ...props }: FollowTopicsEmailProps) => {
    const locale = resolveUiLocale(uiLocale)
    const t = emailCopy(locale, 'follow-topics')
    return {
      ...props,
      locale,
      t,
      recommendations: topics.map(topic => ({
        name: topic.name,
        url: topic.url,
        detail: topic.reason ?? t('fallbackReason'),
      })),
    }
  },
)

FollowTopicsEmail.PreviewProps = {
  userName: 'Alex',
  topics: [
    {
      name: 'Credit Cards',
      url: 'https://voucha.ai/topics/credit-cards',
      reason: 'Your circle follows this topic often.',
    },
    {
      name: 'Travel',
      url: 'https://voucha.ai/topics/travel',
    },
  ],
  settingsUrl: 'https://voucha.ai/my/topics/following',
  unsubscribeUrl: 'https://voucha.ai/my/notification-settings',
  physicalAddress: '123 Placeholder St, Suite 100, San Francisco, CA 94105',
}

export default FollowTopicsEmail
