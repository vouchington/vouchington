import {
  describeInvalidModelSelection,
  describeInvalidOpenAITransport,
  MODEL_SERVICE_SLUGS,
  modelFieldName,
  providerFieldName,
} from '@modules/model-providers/routing'
import { DynamicConfigValidationError } from 'valkyries/dynamic-config'
import type { DynamicConfigFields } from '@vouchington/dynamic-config'

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
