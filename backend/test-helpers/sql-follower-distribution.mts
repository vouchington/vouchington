import { read, write } from '@data-stores/psql'
import sql from 'sql-template-strings'

export async function getFollowerDistributionFailureReasonsForTest(
  distributionIds: string[],
): Promise<string[]> {
  const { rows } = await read<{ failure_reason: string | null }>(
    sql`/* getFollowerDistributionFailureReasonsForTest */
      SELECT failure_reason
      FROM follower_distributions
      WHERE id = ANY(${distributionIds}::uuid[])
      ORDER BY id
    `,
  )
  return rows.map(row => row.failure_reason ?? '')
}

export async function countFollowerDistributionsForSenderForTest(
  senderUserId: string,
): Promise<number> {
  const { rows } = await read<{
    count: string
  }>(sql`/* countFollowerDistributionsForSenderForTest */
    SELECT COUNT(*) AS count
    FROM follower_distributions
    WHERE sender_user_id = ${senderUserId}
  `)
  return Number(rows[0]?.count ?? 0)
}

export async function getFollowerDistributionFailureForTest(
  distributionId: string,
): Promise<{ failed: boolean; failure_reason: string | null } | undefined> {
  const { rows } = await read<{ failed: boolean; failure_reason: string | null }>(
    sql`/* getFollowerDistributionFailureForTest */
      SELECT failed_at IS NOT NULL AS failed, failure_reason
      FROM follower_distributions
      WHERE id = ${distributionId}
    `,
  )
  return rows[0]
}

export async function markFollowerDistributionFailedForTest(distributionId: string): Promise<void> {
  await write(sql`/* markFollowerDistributionFailedForTest */
    UPDATE follower_distributions
    SET failed_at = CURRENT_TIMESTAMP,
      completed_at = NULL
    WHERE id = ${distributionId}
  `)
}

export async function markUserFollowDeletedBeforeNowForTest(params: {
  followerId: string
  followingId: string
}): Promise<void> {
  await write(sql`/* markUserFollowDeletedBeforeNowForTest */
    UPDATE relation__user__follow__user
    SET created_at = CURRENT_TIMESTAMP - INTERVAL '1 hour',
      deleted_at = CURRENT_TIMESTAMP - INTERVAL '1 minute',
      deleted_by_id = ${params.followerId}
    WHERE subject_id = ${params.followerId}
      AND object_id = ${params.followingId}
  `)
}
