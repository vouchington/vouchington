import { refreshMaterializedView } from '@data-stores/psql/migrate'

const RETRYABLE_CONTENTION_MESSAGE = 'Materialized view refresh contention; retryable'
const RETRY_DEADLINE_MS = 5_000
const RETRY_DELAY_MS = 50

/**
 * Retry a real refresh without changing the production nonblocking lock contract.
 * The synchronous observer runs only when contention will be retried; thrown values reject
 * unchanged and stop retries. It cannot return asynchronous work. Omitted observers preserve
 * the existing deadline and retry schedule.
 */
export async function refreshMaterializedViewForTest(
  viewName: string,
  options: { onRetryableContention?: () => undefined } = {},
): Promise<void> {
  const deadline = Date.now() + RETRY_DEADLINE_MS
  while (true) {
    try {
      await refreshMaterializedView(viewName)
      return
    } catch (err) {
      if (!(err instanceof Error) || err.message !== RETRYABLE_CONTENTION_MESSAGE) throw err
      if (Date.now() >= deadline) throw err
      options.onRetryableContention?.()
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS))
    }
  }
}
