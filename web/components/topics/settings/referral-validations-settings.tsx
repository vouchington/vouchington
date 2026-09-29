import { getTranslations } from '@/lib/i18n/get-translations'
import { referralValidationsSettingsLabels } from './referral-validations-settings-labels'
import {
  ReferralValidationsSettingsView,
  type ReferralValidationsSettingsProps,
} from './referral-validations-settings-view'

export async function ReferralValidationsSettings({
  referralProgramId,
  linkedValidations,
  validationsBasePath,
}: ReferralValidationsSettingsProps) {
  const t = await getTranslations()
  return (
    <ReferralValidationsSettingsView
      referralProgramId={referralProgramId}
      linkedValidations={linkedValidations}
      validationsBasePath={validationsBasePath}
      labels={referralValidationsSettingsLabels(t)}
    />
  )
}
