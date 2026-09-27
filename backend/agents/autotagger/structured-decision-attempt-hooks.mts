import { assertOpenAiSpendCapNotBreached, latchAccountingUncertainty } from '@services/ai-usage'
import {
  createStructuredDecisionBillingHooks,
  recordAgentResponseUsage,
  type StructuredDecisionBillingSubject,
} from '@agents/_shared'
import type { StructuredDecisionAttemptHooks } from '@modules/structured-decisions'
import type { AutotaggerReceiptSubject } from '@services/autotagger'

const AUTOTAGGER_AGENT_SLUG = 'autotagger'

interface AutotaggerStructuredDecisionHooksDeps {
  assertOpenAiSpendCapNotBreached?: typeof assertOpenAiSpendCapNotBreached
  latchAccountingUncertainty?: typeof latchAccountingUncertainty
  recordAgentResponseUsage?: typeof recordAgentResponseUsage
}

/** C6 binds the shared structured-decision accounting policy to its receipt subject. */
export function createAutotaggerStructuredDecisionHooks(
  subject: AutotaggerReceiptSubject,
  deps: AutotaggerStructuredDecisionHooksDeps = {},
): StructuredDecisionAttemptHooks {
  const billingSubject: StructuredDecisionBillingSubject = {
    workload: AUTOTAGGER_AGENT_SLUG,
    postId: subject.postId,
  }
  return createStructuredDecisionBillingHooks(billingSubject, deps)
}
