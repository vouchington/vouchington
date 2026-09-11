import { AsyncLocalStorage } from 'node:async_hooks'
import onError from '@modules/on-error'

interface TokenAccumulatorStore {
  total: number
}

const tokenAccumulatorStorage = new AsyncLocalStorage<TokenAccumulatorStore>()

/**
 * Runs fn inside a fresh token-accumulator scope, then reports the summed token count -- every
 * addAccumulatedTokens() call recordAgentResponseUsage (record-response-usage.mts) makes during
 * fn's execution -- to onSettled once fn settles. Entered once per glide-mq job in
 * processAIAgentWorkerJob (backend/workers/ai-agents/workers/core.mts), so glide-mq's
 * tokenLimiter there sees real per-job TPM consumption instead of staying permanently at zero
 * (#8836) -- recordAgentResponseUsage is the single choke point every call site (direct calls,
 * the tool loop, the streaming tool loop) already flows through.
 *
 * onSettled runs in a finally, so tokens accumulated up to the point of a failure are still
 * reported even when fn throws; the throw itself still propagates unchanged. onSettled's own
 * rejection (e.g. a Valkey blip inside job.reportTokens()) is caught and sent to onError rather
 * than left to propagate from the finally block -- a bare throw there would replace whatever fn
 * threw, which would hide a real OpenAI rate-limit error from processAIAgentWorkerJob's
 * handleOpenAIRateLimit and leave the queue unpaused.
 */
export async function runWithJobTokenAccumulator<T>(
  fn: () => Promise<T>,
  onSettled: (totalTokens: number) => Promise<void>,
): Promise<T> {
  const store: TokenAccumulatorStore = { total: 0 }
  try {
    return await tokenAccumulatorStorage.run(store, fn)
  } finally {
    // try/await/catch rather than chaining .catch() directly on onSettled(...)'s return value:
    // the latter throws instead of failing safe when a caller's onSettled resolves without ever
    // producing a real Promise object (e.g. an unconfigured `vi.fn()` test double).
    if (store.total > 0) {
      try {
        await onSettled(store.total)
      } catch (error) {
        onError(error as Error)
      }
    }
  }
}

/**
 * Adds to the active job's token accumulator, if one is active. Outside a
 * runWithJobTokenAccumulator scope (direct script usage, most existing tests) there is no active
 * store, and this is a no-op -- callers never need to check whether a job is in flight.
 */
export function addAccumulatedTokens(count: number): void {
  const store = tokenAccumulatorStorage.getStore()
  if (store) store.total += count
}
