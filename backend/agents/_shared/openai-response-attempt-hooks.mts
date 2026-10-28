import { assertDailySpendCapNotBreached, SpendCapBreachError } from '@services/ai-usage'
import type { OpenAIResponseAttemptHooks } from './create-response.mts'

export type { OpenAIResponseAttemptHooks } from './create-response.mts'

/** A later physical attempt was refused after only positively unbilled capacity failures. */
export class UnbilledRetrySpendCapBreachError extends SpendCapBreachError {}

interface OpenAIResponseAttemptHookDeps {
  assertDailySpendCapNotBreached?: typeof assertDailySpendCapNotBreached
}

/**
 * The first attempt is checked by the caller immediately before entering the provider boundary.
 * Free flex-capacity retries re-enter the same guard here.
 */
export function createOpenAIResponseAttemptHooks(
  agentSlug: string,
  deps: OpenAIResponseAttemptHookDeps = {},
): OpenAIResponseAttemptHooks {
  const checkSpendCap = deps.assertDailySpendCapNotBreached ?? assertDailySpendCapNotBreached
  return {
    beforeAttempt: async ({ attempt }) => {
      if (attempt === 1) return
      const breach = await checkSpendCap(agentSlug)
      if (breach) throw new UnbilledRetrySpendCapBreachError(breach)
    },
  }
}
