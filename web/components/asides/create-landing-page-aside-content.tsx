'use client'

import { DismissibleCtaAside } from '@/components/asides/dismissible-cta-aside'
import { useTranslations } from '@/lib/i18n/use-translations'

export function CreateLandingPageAsideContent({
  dismissKey = 'aside-create-landing-page',
  'data-pw': dataPw = 'create-landing-page-aside-content',
}: {
  dismissKey?: string
  'data-pw'?: string
}) {
  const t = useTranslations()
  return (
    <DismissibleCtaAside
      dismissKey={dismissKey}
      data-pw={dataPw}
      title={t('extracted.asides.createLandingPageAsideContent.createYourLandingPage_125a0afc')}
      description={t(
        'extracted.asides.createLandingPageAsideContent.buildAShareableUsernamePageTo_9cc59846',
      )}
      href='/my/landing-pages'
      actionLabel={t('extracted.asides.createLandingPageAsideContent.buildIt_5e383207')}
      variant='outline'
    />
  )
}
