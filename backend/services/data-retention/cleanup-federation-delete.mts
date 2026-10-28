import { getMinUUIDv7ForDate } from '@modules/utils'
import type {
  FederationRetentionPosition,
  FederationRetentionQuery,
} from './cleanup-federation.types.mts'

export async function deleteRetentionCandidates(
  query: FederationRetentionQuery,
  cutoffAt: Date,
  candidates: FederationRetentionPosition[],
  batchSize: number,
): Promise<number> {
  const ids = candidates.map(candidate => candidate.id)
  const { rowCount } = await query(
    `/* deleteExpiredFollowerDistributions */
     WITH page AS MATERIALIZED (
       SELECT id FROM follower_distributions
       WHERE id = ANY($1::uuid[]) AND id < $2::uuid
         AND (completed_at IS NOT NULL OR failed_at IS NOT NULL)
       ORDER BY id LIMIT $3 FOR UPDATE
     ) DELETE FROM follower_distributions target USING page WHERE target.id = page.id`,
    [ids, getMinUUIDv7ForDate(cutoffAt), batchSize],
  )
  return rowCount ?? 0
}
