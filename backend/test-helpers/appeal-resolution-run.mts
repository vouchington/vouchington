import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { createAppealResolutionRun } from '../services/moderation-appeals/rerun-outcomes.mts'

/** Admits a generation without claiming it, like pre-enqueue production admission. */
export function createUnclaimedAppealResolutionRunForTest(appealId: string): Promise<string> {
  return createAppealResolutionRun(write, appealId)
}

/** Reserve a real appeal request generation for direct agent tests. */
export async function appealResolutionRunInputForTest(appealId: string, rerunById?: string) {
  const { rows } = await write<{ ai_draft_requested_run_id: string | null }>(sql`
    /* appealResolutionRunInputForTest */
    SELECT ai_draft_requested_run_id FROM moderation_appeals WHERE id = ${appealId}
  `)
  // An unknown appeal gets a run id no row backs, so the agent's missing-appeal path is exercised.
  const runId = !rows[0]
    ? crypto.randomUUID()
    : rerunById
      ? await createAppealResolutionRun(write, appealId, { claim: true })
      : (rows[0].ai_draft_requested_run_id ??
        (await createAppealResolutionRun(write, appealId, { claim: true })))
  return { appealId, runId, ...(rerunById ? { rerunById } : {}) }
}
