'use client'

import { DismissibleCtaAside } from '@/components/asides/dismissible-cta-aside'
import { useTranslations } from '@/lib/i18n/use-translations'

export function FollowTopicsAsideContent({
  dismissKey = 'aside-follow-topics',
  'data-pw': dataPw = 'follow-topics-aside-content',
}: {
  dismissKey?: string
  'data-pw'?: string
}) {
  const t = useTranslations()
  return (
    <DismissibleCtaAside
      dismissKey={dismissKey}
      data-pw={dataPw}
      title={t('extracted.asides.followTopicsAsideContent.followTopics_699c77e5')}
      description={t(
        'extracted.asides.followTopicsAsideContent.followTopicsToPersonalizeYourFeed_a90a7acd',
      )}
      href='/topics'
      actionLabel={t('extracted.asides.followTopicsAsideContent.browseTopics_5a51754b')}
      variant='outline'
    />
  )
}
