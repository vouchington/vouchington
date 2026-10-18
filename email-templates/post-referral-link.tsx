import { type EmailTranslator, resolveEmailLocale } from '@vouchington/email'

import { SUPPORTED_UI_LOCALES, DEFAULT_UI_LOCALE } from '@ts-shared/languages/ui-locales'
import { emailCopy } from './catalog-copy.mts'

import { createRecommendationEmail } from './recommendation-email.tsx'
import type { PostReferralLinkEmailProps } from './types.mts'

function formatLinkCount(t: EmailTranslator, linkCount?: number): string {
  return linkCount === undefined ? t('fallbackCount') : t('activeLinks', { count: linkCount })
}

const PostReferralLinkEmail = createRecommendationEmail(
  ({ referralPrograms, uiLocale, ...props }: PostReferralLinkEmailProps) => {
    const locale = resolveEmailLocale(uiLocale, SUPPORTED_UI_LOCALES, DEFAULT_UI_LOCALE)
    const t = emailCopy(locale, 'post-referral-link')
    return {
      ...props,
      locale,
      t,
      recommendations: referralPrograms.map(program => ({
        name: program.name,
        url: program.url,
        detail: formatLinkCount(t, program.linkCount),
      })),
    }
  },
)

PostReferralLinkEmail.PreviewProps = {
  userName: 'Alex',
  referralPrograms: [
    {
      name: 'Travel Cards',
      url: 'https://voucha.ai/referral-programs/travel-cards',
      linkCount: 3,
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
}

export default PostReferralLinkEmail
