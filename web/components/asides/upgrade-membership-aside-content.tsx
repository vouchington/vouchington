'use client'

import { DismissibleCtaAside } from '@/components/asides/dismissible-cta-aside'
import { useTranslations } from '@/lib/i18n/use-translations'

export function UpgradeMembershipAsideContent({
  dismissKey = 'aside-upgrade-membership',
  'data-pw': dataPw = 'upgrade-membership-aside-content',
}: {
  dismissKey?: string
  'data-pw'?: string
}) {
  const t = useTranslations()
  return (
    <DismissibleCtaAside
      dismissKey={dismissKey}
      data-pw={dataPw}
      title={t('extracted.asides.upgradeMembershipAsideContent.upgradeToPlus_caf72e78')}
      description={t(
        'extracted.asides.upgradeMembershipAsideContent.removeWaitingPeriodsIncreaseContributionLimits_bafef1eb',
      )}
      href='/plans'
      actionLabel={t('extracted.asides.upgradeMembershipAsideContent.viewPlans_a72e2bd3')}
    />
  )
}
