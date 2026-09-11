import { write } from '@data-stores/psql'
import pMap from 'p-map'
import sql from 'sql-template-strings'

export type ModerationTransparencyReleaseCandidate = {
  day: string
  community_id: string | null
  metric: string
  category: string
}

/** Releases one candidate per transaction, preventing cross-cohort lock accumulation. */
export async function releaseModerationTransparencyCandidates(
  candidates: readonly ModerationTransparencyReleaseCandidate[],
  cutoff: Date,
): Promise<void> {
  await pMap(
    candidates,
    async candidate => {
      await write(sql`/* releaseModerationTransparencyCohort */
        SELECT fn_release_moderation_transparency_daily_rollup(
          ${candidate.day}::date, ${candidate.community_id}::uuid,
          ${candidate.metric}, ${candidate.category}, ${cutoff}
        )
      `)
    },
    { concurrency: 4, stopOnError: false },
  )
}
