import type { Translator } from '@ts-shared/ui-messages'

export interface ReferralValidationsSettingsLabels {
  linkAValidation: string
  manageAllValidations: string
  linkedValidations: string
  empty: string
}

export function referralValidationsSettingsLabels(
  t: Translator,
): ReferralValidationsSettingsLabels {
  return {
    linkAValidation: t('extracted.settings.referralValidationsSettings.linkAValidation_bdb222c6'),
    manageAllValidations: t(
      'extracted.settings.referralValidationsSettings.manageAllValidations_74b7fb7b',
    ),
    linkedValidations: t(
      'extracted.settings.referralValidationsSettings.linkedValidations_aa3b7e70',
    ),
    empty: t(
      'extracted.settings.referralValidationsSettings.noValidationSetsLinkedToThis_14d2cedb',
    ),
  }
}
