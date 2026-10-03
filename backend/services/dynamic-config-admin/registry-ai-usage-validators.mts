import { SPEND_CAP_MAX_VALUES, SPEND_CAP_MIN_VALUES } from '@services/ai-usage/spend-cap-config'
import { validatePositiveSafeIntegerFields } from './registry-validators.mts'
import type { DynamicConfigFields } from './types.mts'

export function validateSpendCapConfig(next: DynamicConfigFields): void {
  validatePositiveSafeIntegerFields(
    next,
    ['daily_cap_microunits'],
    SPEND_CAP_MIN_VALUES,
    SPEND_CAP_MAX_VALUES,
  )
}
