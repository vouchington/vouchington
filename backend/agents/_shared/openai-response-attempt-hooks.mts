import {
  assertOpenAiSpendCapNotBreached,
  latchAccountingUncertainty,
  OpenAiSpendCapBreachError,
} from '@services/ai-usage'
import { getUtcDayFromDate } from '@ts-shared/utils/dates'
import {
  runWithOpenAIResponseAttemptHooks,
  type OpenAIResponseAttemptHooks,
} from './create-response.mts'

export type { OpenAIResponseAttemptHooks } from './create-response.mts'

interface OpenAIResponseAttemptHookDeps {
  assertOpenAiSpendCapNotBreached?: typeof assertOpenAiSpendCapNotBreached
  latchAccountingUncertainty?: typeof latchAccountingUncertainty
}

/**
 * The first attempt is checked by the caller immediately before entering the provider boundary.
 * Free flex-capacity retries re-enter the same guard here; ambiguous billed failures latch and
 * stop in the provider module before any retry can be attempted.
 */
export function createOpenAIResponseAttemptHooks(
  agentSlug: string,
  deps: OpenAIResponseAttemptHookDeps = {},
): OpenAIResponseAttemptHooks {
  const checkSpendCap = deps.assertOpenAiSpendCapNotBreached ?? assertOpenAiSpendCapNotBreached
  const latchUncertainty = deps.latchAccountingUncertainty ?? latchAccountingUncertainty
  return {
    beforeAttempt: async ({ attempt }) => {
      if (attempt === 1) return
      const breach = await checkSpendCap(agentSlug)
      if (breach) throw new OpenAiSpendCapBreachError(breach)
    },
    onUnknownBilledAttempt: async ({ requestStartedAt }) => {
      await latchUncertainty({
        requestDay: getUtcDayFromDate(requestStartedAt),
        source: 'unknown_billed_attempt',
      })
    },
  }
}

export async function nextOpenAIResponseStreamStep<Yielded, Returned>(
  generator: AsyncGenerator<Yielded, Returned>,
  hooks: OpenAIResponseAttemptHooks | undefined,
): Promise<IteratorResult<Yielded, Returned>> {
  if (!hooks) return generator.next()
  return runWithOpenAIResponseAttemptHooks(hooks, () => generator.next())
}
