import { assertSafeSqlIdentifier } from '@vouchington/postgres/partitions'
import type { TransactionQuery } from '@data-stores/psql'

export async function insertTestPostClearanceChangeForPartitionGuard(
  query: TransactionQuery,
  postId: string,
  actorId: string,
): Promise<void> {
  await query(
    `/* partitionDropGuard:fixtureEvent */
     INSERT INTO post_clearance_changes
       (id, post_id, post_author_user_id, change_type, changed_by_id)
     VALUES (uuidv7(), $1::uuid, $2::uuid, 'approve', $2::uuid)`,
    [postId, actorId],
  )
}

export async function readLatestTestPostClearanceChangeForPost(
  query: TransactionQuery,
  postId: string,
): Promise<{ post_author_user_id: string; changed_by_id: string } | undefined> {
  const { rows } = await query<{ post_author_user_id: string; changed_by_id: string }>(
    `/* partitionDropGuard:readFixtureEvent */
     SELECT post_author_user_id, changed_by_id FROM post_clearance_changes
     WHERE post_id = $1::uuid ORDER BY id DESC LIMIT 1`,
    [postId],
  )
  return rows[0]
}

export async function insertTestPreservationHoldForPartitionGuard(
  query: TransactionQuery,
  accountUserId: string,
  referenceCiphertext: string,
): Promise<void> {
  await query(
    `/* partitionDropGuard:fixtureHold */
     INSERT INTO user_legal_preservation_holds
       (account_user_id, placed_by_id, reference_ciphertext)
     VALUES ($1::uuid, $1::uuid, $2)`,
    [accountUserId, referenceCiphertext],
  )
}

export async function insertTestCommunityReviewChangeForPartitionGuard(
  query: TransactionQuery,
  communityId: string,
  postId: string,
  actorId: string,
): Promise<{ post_author_user_id: string; changed_by_id: string } | undefined> {
  const { rows } = await query<{ post_author_user_id: string; changed_by_id: string }>(
    `/* partitionDropGuard:communityFixtureEvent */
     INSERT INTO community_post_review_changes
       (community_id, post_id, post_author_user_id, changed_by_id, change_type, is_platform_override)
     VALUES ($1::uuid, $2::uuid, $3::uuid, $3::uuid, 'approve', FALSE)
     RETURNING post_author_user_id, changed_by_id`,
    [communityId, postId, actorId],
  )
  return rows[0]
}

export async function lockClearancePartitionRetirementTablesForTest(
  transaction: TransactionQuery,
  input: {
    referenceTables: readonly string[]
    parent: string
    child: string
  },
): Promise<void> {
  const parent = assertSafeSqlIdentifier(input.parent)
  const child = assertSafeSqlIdentifier(input.child)
  for (const table of input.referenceTables) {
    await transaction(
      `/* retireOwnedClearancePartition:lockReference */ LOCK TABLE ${assertSafeSqlIdentifier(table)} IN ACCESS EXCLUSIVE MODE`,
    )
  }
  await transaction(
    `/* retireOwnedClearancePartition:lockParent */ LOCK TABLE ${parent} IN ACCESS EXCLUSIVE MODE`,
  )
  await transaction(
    `/* retireOwnedClearancePartition:lockCandidate */ LOCK TABLE ${child} IN ACCESS EXCLUSIVE MODE`,
  )
  await transaction(
    '/* retireOwnedClearancePartition:lockHolds */ LOCK TABLE user_legal_preservation_holds IN SHARE MODE',
  )
}
