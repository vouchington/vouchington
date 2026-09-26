import {
  createStructuredDecisionSpendHooks,
  type StructuredDecisionSpendHooksDeps,
} from '@agents/_shared'
import type { StructuredDecisionAttemptHooks } from '@modules/structured-decisions'
import type { AutotaggerReceiptSubject } from '@services/autotagger'

const AUTOTAGGER_AGENT_SLUG = 'autotagger'

/**
 * Autotagger's binding of the shared structured-decision spend hooks (issue #616): attributes
 * spend to `subject.postId` when the classifier ran against a post, and to neither field when it
 * ran against an RSS feed item (`rssFeedItemId` is not an `ai_usage_records` attribution column).
 * See `createStructuredDecisionSpendHooks` (`backend/agents/_shared/structured-decision-spend-hooks.mts`)
 * for the mechanism this wires up.
 */
export function createAutotaggerStructuredDecisionHooks(
  subject: AutotaggerReceiptSubject,
  deps: StructuredDecisionSpendHooksDeps = {},
): StructuredDecisionAttemptHooks {
  return createStructuredDecisionSpendHooks(
    AUTOTAGGER_AGENT_SLUG,
    subject.postId ? { postId: subject.postId } : {},
    deps,
  )
}
