'use client'

import { referralValidationsSettingsLabels } from '@/components/topics/settings/referral-validations-settings-labels'
import {
  ReferralValidationsSettingsView,
  type ReferralValidationsSettingsProps,
} from '@/components/topics/settings/referral-validations-settings-view'
import { useTranslations } from '@/lib/i18n/use-translations'

/**
 * Storybook stand-in for the async server settings panel. The real export awaits
 * getTranslations(), which reaches next/headers, and React cannot render that async
 * component in the client runner.
 */
export function ReferralValidationsSettings({
  referralProgramId,
  linkedValidations,
  validationsBasePath,
}: ReferralValidationsSettingsProps) {
  const t = useTranslations()
  return (
    <ReferralValidationsSettingsView
      referralProgramId={referralProgramId}
      linkedValidations={linkedValidations}
      validationsBasePath={validationsBasePath}
      labels={referralValidationsSettingsLabels(t)}
    />
  )
}
