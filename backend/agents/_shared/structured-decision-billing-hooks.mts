import { assertDailySpendCapNotBreached, SpendCapBreachError } from '@services/ai-usage'
import type {
  StructuredDecisionAttemptHooks,
  StructuredDecisionBilledResponse,
} from '@modules/structured-decisions'
import { recordAgentResponseUsage } from './record-response-usage.mts'

type StructuredDecisionBillingSubject = {
  workload: string
  /** The classifier run this client serves; every billed response is attributed to it. */
  classifierRunId: string
  postId?: string | null
  communityId?: string | null
  beforeAttempt?: StructuredDecisionAttemptHooks['beforeAttempt']
}

interface StructuredDecisionBillingHooksDeps {
  assertDailySpendCapNotBreached?: typeof assertDailySpendCapNotBreached
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
  const checkSpendCap = deps.assertDailySpendCapNotBreached ?? assertDailySpendCapNotBreached
  const recordUsage = deps.recordAgentResponseUsage ?? recordAgentResponseUsage
  return {
    beforeAttempt: async attempt => {
      const breach = await checkSpendCap(subject.workload)
      if (breach) throw new SpendCapBreachError(breach)
      await subject.beforeAttempt?.(attempt)
    },
    onBilledResponse: async response => {
      await recordStructuredDecisionUsage(response, subject, recordUsage)
    },
  }
}

async function recordStructuredDecisionUsage(
  response: StructuredDecisionBilledResponse,
  subject: StructuredDecisionBillingSubject,
  recordUsage: typeof recordAgentResponseUsage,
): Promise<void> {
  await recordUsage({
    ...structuredDecisionUsageRecord(response),
    agentSlug: subject.workload,
    postId: subject.postId,
    communityId: subject.communityId,
    classifier: {
      runId: subject.classifierRunId,
      // The body has been read by now: from request start to here is the provider's latency.
      latencyMs: Math.max(0, Date.now() - response.requestStartedAt.getTime()),
    },
    createdAt: response.requestStartedAt,
  })
}

/**
 * The ledger fields of one billed structured decision. OpenAI Decisions reports no service tier and
 * bills input at the model's Standard rates but no output, so its output tokens record as zero.
 * Jev is TypeSafe's model, whichever transport reaches it.
 */
export function structuredDecisionUsageRecord(response: StructuredDecisionBilledResponse) {
  const openai = response.transport === 'openai'
  return {
    response: {
      id: typeof response.id === 'string' ? response.id : undefined,
      model: typeof response.model === 'string' ? response.model : undefined,
      usage: openai ? { ...response.usage, output_tokens: 0 } : response.usage,
      service_tier: openai ? ('default' as const) : undefined,
    },
    provider: openai ? 'openai' : 'typesafe',
    transport: openai ? 'direct' : response.transport,
  }
}
