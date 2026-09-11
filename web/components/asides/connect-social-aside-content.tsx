'use client'

import { DismissibleCtaAside } from '@/components/asides/dismissible-cta-aside'
import { useTranslations } from '@/lib/i18n/use-translations'

export function ConnectSocialAsideContent({
  dismissKey = 'aside-connect-social',
  'data-pw': dataPw = 'connect-social-aside-content',
}: {
  dismissKey?: string
  'data-pw'?: string
}) {
  const t = useTranslations()
  return (
    <DismissibleCtaAside
      dismissKey={dismissKey}
      data-pw={dataPw}
      title={t('extracted.asides.connectSocialAsideContent.connectYourAccounts_0e7cf4c1')}
      description={t(
        'extracted.asides.connectSocialAsideContent.linkYourSocialAccountsToBuild_df291f48',
      )}
      href='/my/identity'
      actionLabel={t('extracted.asides.connectSocialAsideContent.connectAccounts_a7223ac1')}
      variant='outline'
    />
  )
}
