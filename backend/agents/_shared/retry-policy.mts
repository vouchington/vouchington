/**
 * Per-workload OpenAI retry budgets (#8155).
 *
 * `create-response.mts` disables SDK-internal retries and interprets `maxRetries` as an
 * application-owned budget. Only the positively known-unbilled flex `resource_unavailable` 429
 * may consume that budget; an ambiguous potentially billed failure latches accounting uncertainty
 * and stops instead of issuing another physical request. Once this budget is spent (or flex
 * capacity is reported as a streamed failure) a flex request is resent once on the default tier
 * outside the budget (`@modules/openai-utils/flex-fallback`). Two workload shapes still need a
 * budget different from the default 2 because free capacity failures affect their latency
 * differently:
 *
 * - A user is waiting on this request synchronously (no queue behind it): fewer retries, because
 *   a slow failure is worse than a fast one.
 * - Everything dispatched through glide-mq is retried at the queue level too, so the request-level
 *   free-capacity budget is set explicitly to the former SDK default rather than left implicit.
 */

interface RetryPolicy {
  maxRetries: number
  rationale: string
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
