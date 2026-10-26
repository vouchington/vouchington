import { getMinUUIDv7ForDate } from '@modules/utils'
import type {
  FederationRetentionPosition,
  FederationRetentionQuery,
} from './cleanup-federation.types.mts'

export async function listRetentionCandidates(
  query: FederationRetentionQuery,
  cutoffAt: Date,
  limit: number,
): Promise<FederationRetentionPosition[]> {
  const { rows } = await query<{ id: string }>(
    `/* listFollowerDistributionRetentionCandidates */
     SELECT id FROM follower_distributions
     WHERE id < $1::uuid AND (completed_at IS NOT NULL OR failed_at IS NOT NULL)
     ORDER BY id LIMIT $2 FOR UPDATE SKIP LOCKED`,
    [getMinUUIDv7ForDate(cutoffAt), limit],
  )
  return rows.map(row => ({ id: row.id }))
}
