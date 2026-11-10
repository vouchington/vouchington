import type { Translator } from '@ts-shared/ui-messages'

/** Code-keyed copy for household admission refusals. The API contract is the code. */
export function householdLimitDisplayMessages(
  t: Translator,
  action: 'create' | 'accept',
): Readonly<Record<string, string>> {
  return {
    HOUSEHOLD_LIMIT_REACHED: t('settings.householdLimits.createLimit'),
    HOUSEHOLD_MEMBER_LIMIT_REACHED: t('settings.householdLimits.memberLimit'),
    INDIVIDUAL_HOUSEHOLD_LIMIT_REACHED:
      action === 'create'
        ? t('settings.householdLimits.individualCreateLimit')
        : t('settings.householdLimits.individualJoinLimit'),
  }
}
