import { getMinUUIDv7ForDate } from '@modules/utils'
import type {
  FederationRetentionPosition,
  FederationRetentionQuery,
  FederationRetentionScope,
} from './cleanup-federation.types.mts'

const MINIMUM_UUIDV7 = '00000000-0000-7000-8000-000000000000'

export async function findRetentionUpperBound(
  query: FederationRetentionQuery,
  cutoffAt: Date,
  scope?: FederationRetentionScope,
): Promise<FederationRetentionPosition | null> {
  if (scope) {
    const { rows } = await query<{ id: string }>(
      `/* findFollowerDistributionRetentionUpperBound */
       SELECT id FROM follower_distributions
       WHERE id < $1::uuid AND (completed_at IS NOT NULL OR failed_at IS NOT NULL)
         AND id = ANY($2::uuid[]) ORDER BY id DESC LIMIT 1`,
      [getMinUUIDv7ForDate(cutoffAt), scope.followerDistributionIds],
    )
    return rows[0] ? { id: rows[0].id } : null
  }
  const { rows } = await query<{ id: string }>(
    `/* findFollowerDistributionRetentionUpperBound */
     SELECT id FROM follower_distributions
     WHERE id < $1::uuid AND (completed_at IS NOT NULL OR failed_at IS NOT NULL)
     ORDER BY id DESC LIMIT 1`,
    [getMinUUIDv7ForDate(cutoffAt)],
  )
  return rows[0] ? { id: rows[0].id } : null
}

export async function listRetentionCandidates(
  query: FederationRetentionQuery,
  cutoffAt: Date,
  cursorId: string | null,
  upperBoundId: string,
  limit: number,
  scope?: FederationRetentionScope,
): Promise<FederationRetentionPosition[]> {
  if (scope) {
    const { rows } = await query<{ id: string }>(
      `/* listFollowerDistributionRetentionCandidates */
       SELECT id FROM follower_distributions
       WHERE id < $1::uuid AND id > $2::uuid
         AND id <= $3::uuid AND (completed_at IS NOT NULL OR failed_at IS NOT NULL)
         AND id = ANY($4::uuid[])
       ORDER BY id LIMIT $5`,
      [
        getMinUUIDv7ForDate(cutoffAt),
        cursorId ?? MINIMUM_UUIDV7,
        upperBoundId,
        scope.followerDistributionIds,
        limit,
      ],
    )
    return rows.map(row => ({ id: row.id }))
  }
  const { rows } = await query<{ id: string }>(
    `/* listFollowerDistributionRetentionCandidates */
     SELECT id FROM follower_distributions
     WHERE id < $1::uuid AND id > $2::uuid AND id <= $3::uuid
       AND (completed_at IS NOT NULL OR failed_at IS NOT NULL)
     ORDER BY id LIMIT $4`,
    [getMinUUIDv7ForDate(cutoffAt), cursorId ?? MINIMUM_UUIDV7, upperBoundId, limit],
  )
  return rows.map(row => ({ id: row.id }))
}
