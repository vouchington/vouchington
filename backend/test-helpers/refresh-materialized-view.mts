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
    } catch (error) {
      if (!(error instanceof Error) || error.message !== RETRYABLE_CONTENTION_MESSAGE) throw error
      if (Date.now() >= deadline) throw error
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS))
    }
  }
}
