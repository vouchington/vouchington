import {
  assertOpenAiSpendCapNotBreached,
  latchAccountingUncertainty,
  OpenAiSpendCapBreachError,
} from '@services/ai-usage'
import { getUtcDayFromDate } from '@ts-shared/utils/dates'
import type {
  StructuredDecisionAttemptHooks,
  StructuredDecisionBilledResponse,
  StructuredDecisionUnknownBilledAttempt,
} from '@modules/structured-decisions'
import { recordAgentResponseUsage } from './record-response-usage.mts'

export type StructuredDecisionBillingSubject = {
  workload: string
  postId?: string | null
  communityId?: string | null
  beforeAttempt?: StructuredDecisionAttemptHooks['beforeAttempt']
}

interface StructuredDecisionBillingHooksDeps {
  assertOpenAiSpendCapNotBreached?: typeof assertOpenAiSpendCapNotBreached
  latchAccountingUncertainty?: typeof latchAccountingUncertainty
  recordAgentResponseUsage?: typeof recordAgentResponseUsage
}

/**
 * Adds usage accounting and a spend-admission check to one structured-decision workload.
 *
 * The optional `beforeAttempt` is deliberately invoked only after the cap check. Callers use it
 * for durable provider-attempt receipts, so a rejected admission never consumes a retry budget.
 * The structured-decision client has no retry loop; this hook is consequently the last common
 * checkpoint before its one physical provider request.
 */
export function createStructuredDecisionBillingHooks(
  subject: StructuredDecisionBillingSubject,
  deps: StructuredDecisionBillingHooksDeps = {},
): StructuredDecisionAttemptHooks {
  const checkSpendCap = deps.assertOpenAiSpendCapNotBreached ?? assertOpenAiSpendCapNotBreached
  const latchUncertainty = deps.latchAccountingUncertainty ?? latchAccountingUncertainty
  const recordUsage = deps.recordAgentResponseUsage ?? recordAgentResponseUsage
  return {
    beforeAttempt: async attempt => {
      const breach = await checkSpendCap(subject.workload)
      if (breach) throw new OpenAiSpendCapBreachError(breach)
      await subject.beforeAttempt?.(attempt)
    },
    onBilledResponse: async response => {
      await recordStructuredDecisionUsage(response, subject, recordUsage)
    },
    onUnknownBilledAttempt: async attempt => {
      await latchStructuredDecisionAccountingUncertainty(attempt, latchUncertainty)
    },
  }
}

async function recordStructuredDecisionUsage(
  response: StructuredDecisionBilledResponse,
  subject: StructuredDecisionBillingSubject,
  recordUsage: typeof recordAgentResponseUsage,
): Promise<void> {
  await recordUsage({
    response: {
      id: typeof response.id === 'string' ? response.id : undefined,
      model: typeof response.model === 'string' ? response.model : undefined,
      usage: response.usage,
      service_tier: undefined,
    },
    agentSlug: subject.workload,
    postId: subject.postId,
    communityId: subject.communityId,
    createdAt: response.requestStartedAt,
  })
}

async function latchStructuredDecisionAccountingUncertainty(
  attempt: StructuredDecisionUnknownBilledAttempt,
  latchUncertainty: typeof latchAccountingUncertainty,
): Promise<void> {
  await latchUncertainty({
    requestDay: getUtcDayFromDate(attempt.requestStartedAt),
    source: 'unknown_billed_attempt',
  })
}
