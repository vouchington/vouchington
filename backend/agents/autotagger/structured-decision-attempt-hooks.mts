import { getUtcDayFromDate } from '@ts-shared/utils/dates'
import {
  assertOpenAiSpendCapNotBreached,
  latchAccountingUncertainty,
  OpenAiSpendCapBreachError,
} from '@services/ai-usage'
import { recordAgentResponseUsage } from '@agents/_shared'
import type { StructuredDecisionAttemptHooks } from '@modules/structured-decisions'
import type { AutotaggerReceiptSubject } from '@services/autotagger'

const AUTOTAGGER_AGENT_SLUG = 'autotagger'

interface AutotaggerStructuredDecisionHooksDeps {
  assertOpenAiSpendCapNotBreached?: typeof assertOpenAiSpendCapNotBreached
  latchAccountingUncertainty?: typeof latchAccountingUncertainty
  recordAgentResponseUsage?: typeof recordAgentResponseUsage
}

/**
 * Wires the C6 tagging classifier's OpenRouter/Jev spend into the shared `ai_usage_records`
 * ledger and daily spend cap. `@modules/structured-decisions` itself stays billing-agnostic and
 * never imports `@services/ai-usage` -- this factory is the one place that closes the two
 * together for the autotagger dispatch path (Plan #317, issue #616).
 *
 * `beforeAttempt` is the client's only checkpoint -- it makes exactly one attempt per `decide()`
 * call, with no retry loop -- so this rechecks the daily cap immediately before the physical
 * request, mirroring `callRecordingAgentResponseUsage`'s pre-dispatch recheck for the OpenAI tool
 * loop (`backend/agents/_shared/record-response-usage.mts`).
 *
 * `onBilledResponse` reuses `recordAgentResponseUsage` directly instead of a bespoke
 * `recordAiUsage` call: the client has already validated that `usage.input_tokens`/
 * `usage.output_tokens` are finite, non-negative numbers before this fires, so
 * `recordAgentResponseUsage`'s own `if (!response.usage) return` guard can never trigger here.
 * Reuse also gets the `ledger_write_failed` latch, `onError` reporting, and per-job
 * token-accumulator wiring for free -- the same mechanism OpenRouter-provider OpenAI responses
 * already use (`callRecordingAgentResponseUsage`'s `responseProvider: 'openrouter'` branch).
 * `service_tier` is left undefined deliberately: Jev has no service-tier concept, so this falls to
 * the `'unknown-tier'` sentinel, `calcCostMicrounits` finds no matching price, and (absent an
 * explicit `usage.cost`) the row lands `unpriced` -- the same fail-closed path a missing cost
 * always takes.
 *
 * `onUnknownBilledAttempt` latches `unknown_billed_attempt` directly: a network error, an
 * ambiguous HTTP status, or malformed/unreadable usage on an otherwise-2xx response all mean the
 * provider may have billed the request without us ever learning what for.
 */
export function createAutotaggerStructuredDecisionHooks(
  subject: AutotaggerReceiptSubject,
  deps: AutotaggerStructuredDecisionHooksDeps = {},
): StructuredDecisionAttemptHooks {
  const checkSpendCap = deps.assertOpenAiSpendCapNotBreached ?? assertOpenAiSpendCapNotBreached
  const latchUncertainty = deps.latchAccountingUncertainty ?? latchAccountingUncertainty
  const recordUsage = deps.recordAgentResponseUsage ?? recordAgentResponseUsage
  return {
    beforeAttempt: async () => {
      const breach = await checkSpendCap(AUTOTAGGER_AGENT_SLUG)
      if (breach) throw new OpenAiSpendCapBreachError(breach)
    },
    onBilledResponse: async ({ id, model, usage, requestStartedAt }) => {
      await recordUsage({
        response: {
          id: typeof id === 'string' ? id : undefined,
          model: typeof model === 'string' ? model : undefined,
          usage,
          service_tier: undefined,
        },
        agentSlug: AUTOTAGGER_AGENT_SLUG,
        postId: subject.postId,
        createdAt: requestStartedAt,
      })
    },
    onUnknownBilledAttempt: async ({ requestStartedAt }) => {
      await latchUncertainty({
        requestDay: getUtcDayFromDate(requestStartedAt),
        source: 'unknown_billed_attempt',
      })
    },
  }
}
