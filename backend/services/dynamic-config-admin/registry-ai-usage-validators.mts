import {
  OPENAI_SPEND_CAP_MAX_VALUES,
  OPENAI_SPEND_CAP_MIN_VALUES,
} from '@services/ai-usage/spend-cap-config'
import { validatePositiveSafeIntegerFields } from './registry-validators.mts'
import type { DynamicConfigFields } from './types.mts'

export function validateOpenAiSpendCapConfig(next: DynamicConfigFields): void {
  validatePositiveSafeIntegerFields(
    next,
    ['daily_cap_microunits'],
    OPENAI_SPEND_CAP_MIN_VALUES,
    OPENAI_SPEND_CAP_MAX_VALUES,
  )
}
