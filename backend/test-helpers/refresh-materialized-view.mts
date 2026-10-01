import { refreshMaterializedView } from '@data-stores/psql/migrate'

const RETRYABLE_CONTENTION_MESSAGE = 'Materialized view refresh contention; retryable'
const RETRY_DEADLINE_MS = 5_000
const RETRY_DELAY_MS = 50

export async function refreshMaterializedViewForTest(viewName: string): Promise<void> {
  const deadline = Date.now() + RETRY_DEADLINE_MS
  while (true) {
    try {
      await refreshMaterializedView(viewName)
      return
    } catch (err) {
      if (!(err instanceof Error) || err.message !== RETRYABLE_CONTENTION_MESSAGE) throw err
      if (Date.now() >= deadline) throw err
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS))
    }
  }
}
