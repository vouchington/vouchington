'use client'

import { DismissibleCtaAside } from '@/components/asides/dismissible-cta-aside'
import { useTranslations } from '@/lib/i18n/use-translations'

export function CreateFirstPostAsideContent({
  dismissKey = 'aside-create-first-post',
  'data-pw': dataPw = 'create-first-post-aside-content',
}: {
  dismissKey?: string
  'data-pw'?: string
}) {
  const t = useTranslations()
  return (
    <DismissibleCtaAside
      dismissKey={dismissKey}
      data-pw={dataPw}
      title={t('extracted.asides.createFirstPostAsideContent.shareYourFirstReview_bb6df88e')}
      description={t(
        'extracted.asides.createFirstPostAsideContent.helpTheCommunityBySharingYour_788d1d07',
      )}
      href='/reviews/create'
      actionLabel={t('extracted.asides.createFirstPostAsideContent.writeAReview_136286bc')}
    />
  )
}
