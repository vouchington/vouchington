import { parseEnvPositiveInt } from '@modules/queue-config'

/**
 * Per-workload OpenAI retry budgets (#8155).
 *
 * `create-response.mts` disables SDK-internal retries and interprets `maxRetries` as an
 * application-owned budget. Only the positively known-unbilled flex `resource_unavailable` 429
 * may consume that budget; an ambiguous potentially billed failure latches accounting uncertainty
 * and stops instead of issuing another physical request. Two workload shapes still need a budget
 * different from the default 2 because free capacity failures affect their latency differently:
 *
 * - A user is waiting on this request synchronously (no queue behind it): fewer retries, because
 *   a slow failure is worse than a fast one.
 * - A subagent tool call nested inside a chat turn: it should inherit the parent turn's wider
 *   retry budget so a free-capacity 429 doesn't fail the subagent's contribution at the default
 *   while the parent turn itself would have ridden the same failure out.
 * - Everything dispatched through glide-mq is retried at the queue level too, so the request-level
 *   free-capacity budget is set explicitly to the former SDK default rather than left implicit.
 *
 * Chat's own top-level retry budget (`CHAT_OPENAI_MAX_RETRIES`,
 * `backend/agents/chat/openai-tool-loop-stream.mts`) is the single source of truth for this
 * env-tunable value — `CHAT_SUBAGENT_RETRY_POLICY` below reads the same constant so an operator
 * tuning one cannot silently desync the other.
 */

/**
 * Flex-tier chat requests are more likely to hit transient 429 load-shedding than the default
 * free-capacity budget can ride out. Shared by the top-level chat stream and every subagent
 * tool nested inside a chat turn so the two budgets can never drift apart.
 */
export const CHAT_OPENAI_MAX_RETRIES = parseEnvPositiveInt('CHAT_OPENAI_MAX_RETRIES', 5)

export interface RetryPolicy {
  maxRetries: number
  rationale: string
}

/** Subagent tools (`run_profile_agent`, `run_research_agent`, `run_discovery_agent`) nested inside a chat turn. */
export const CHAT_SUBAGENT_RETRY_POLICY: RetryPolicy = {
  maxRetries: CHAT_OPENAI_MAX_RETRIES,
  rationale:
    'Nested inside a chat turn that already budgets CHAT_OPENAI_MAX_RETRIES free-capacity retries; falling back to the default 2 would fail the subagent before the parent turn would have.',
}

/** Requests made on a synchronous, user-waiting request path with no queue behind them. */
export const SYNCHRONOUS_REQUEST_RETRY_POLICY: RetryPolicy = {
  maxRetries: 1,
  rationale:
    'A user is waiting on this request synchronously; a slow failure after several retries is worse than a fast one.',
}

/** Requests dispatched through a glide-mq queue worker, which also retries the whole job. */
export const QUEUED_BACKGROUND_RETRY_POLICY: RetryPolicy = {
  maxRetries: 2,
  rationale:
    'Dispatched through glide-mq, which also retries the whole job; the application-owned free-capacity retry budget is set explicitly to the former SDK default.',
}
