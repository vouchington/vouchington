import { SPEND_CAP_MAX_VALUES, SPEND_CAP_MIN_VALUES } from '@services/ai-usage/spend-cap-config'
import {
  describeInvalidModelSelection,
  describeInvalidOpenAITransport,
  MODEL_SERVICE_SLUGS,
  modelFieldName,
  providerFieldName,
} from '@modules/model-providers/routing'
import { DynamicConfigValidationError } from './namespace.mts'
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

/**
 * Rejects a save that would leave a service on an unknown provider, a model from the other
 * provider, or an unpriced model (whose usage would record as unpriced and trip the spend cap).
 */
export function validateModelRoutingConfig(next: DynamicConfigFields): void {
  const transportProblem = describeInvalidOpenAITransport(next.openai_transport)
  if (transportProblem) throw new DynamicConfigValidationError(transportProblem)
  for (const slug of MODEL_SERVICE_SLUGS) {
    const problem = describeInvalidModelSelection(
      next[providerFieldName(slug)],
      next[modelFieldName(slug)],
    )
    if (problem) throw new DynamicConfigValidationError(`${slug}: ${problem}`)
  }
}
