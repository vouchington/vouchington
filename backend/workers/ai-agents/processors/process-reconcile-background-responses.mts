import onError from '@modules/on-error'
import {
  getExpiredBackgroundResponses,
  reconcileExpiredBackgroundResponse,
} from '@services/openai-background-responses'
import pMap from 'p-map'

export type ReconcileBackgroundResponsesDeps = {
  getExpiredBackgroundResponses: typeof getExpiredBackgroundResponses
  reconcileExpiredBackgroundResponse: typeof reconcileExpiredBackgroundResponse
}

const defaultDeps: ReconcileBackgroundResponsesDeps = {
  getExpiredBackgroundResponses,
  reconcileExpiredBackgroundResponse,
}

// One retrieve()/cancel() call to OpenAI per expired lease. Bounded so a large recovery backlog (e.g.
// after an ECS rolling deploy kills many in-flight workers at once, up to
// BACKGROUND_RESPONSE_RECONCILE_BATCH_SIZE = 100 rows per tick) can't fan out into a burst against
// OpenAI's rate limit -- the exact hazard #8836 exists to avoid. See backend/CLAUDE.md's "avoid
// calling external APIs in a loop or unbounded Promise.all()" rule.
const RECONCILE_CONCURRENCY = 5

/**
 * Sweeps openai_background_responses for leases expired after a crash, OOM kill, or rolling deploy
 * that killed the process before it could cancel/record/delete its own registration (#8836). Each
 * row is reconciled independently and failures are reported rather than thrown, so one bad row
 * never blocks the rest of the batch -- the row stays registered and is retried on the next
 * 5-minute pass (backend/queues/ai-agents/enqueues/schedules.mts).
 */
export async function processReconcileBackgroundResponses(
  dependencyOverrides: Partial<ReconcileBackgroundResponsesDeps> = {},
): Promise<void> {
  const deps = { ...defaultDeps, ...dependencyOverrides }
  const rows = await deps.getExpiredBackgroundResponses()
  await pMap(
    rows,
    row =>
      deps.reconcileExpiredBackgroundResponse(row).catch(error => {
        onError(error)
      }),
    { concurrency: RECONCILE_CONCURRENCY, stopOnError: false },
  )
}
