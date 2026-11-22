import sql from 'sql-template-strings'
import { runBeforePostgresStatementForTest } from './injected-failures.mts'

/** Changes a captured candidate's current membership just before the join writes. */
export function moveStoryClusteringCandidateBeforeJoin(
  candidateId: string,
  destinationStoryId: string,
): () => void {
  return runBeforePostgresStatementForTest('/* assignStoryClusteringItem', async query => {
    await query(sql`/* moveStoryClusteringCandidateBeforeJoin */
      UPDATE rss_feed_items
      SET story_id = ${destinationStoryId}
      WHERE id = ${candidateId}`)
  })
}
