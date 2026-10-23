import { read, write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { acquireTestPostgresAdvisoryLock } from './postgres-advisory-lock.mts'

export function acquireModerationOperationRetentionTestLock() {
  return acquireTestPostgresAdvisoryLock({ namespace: 1_447_904_068, key: 3547, timeout: '25s' })
}

export async function insertTestModerationRetentionClaim(options: {
  id: string
  communityId: string
  postId: string
  claimedById: string
  claimedAt: Date
}): Promise<void> {
  await write(sql`/* insertTestModerationRetentionClaim */
    INSERT INTO moderation_queue_claims (id, community_id, post_id, claimed_by_id, claimed_at)
    VALUES (${options.id}, ${options.communityId}, ${options.postId},
      ${options.claimedById}, ${options.claimedAt})`)
}

export async function insertTestModerationRetentionReveal(options: {
  id: string
  revealedAt: Date
}): Promise<void> {
  await write(sql`/* insertTestModerationRetentionReveal */
    INSERT INTO moderation_media_reveals (id, surface, revealed_at)
    VALUES (${options.id}, 'mod_queue', ${options.revealedAt})`)
}

export async function moderationRetentionRowExists(
  kind: 'claim' | 'reveal',
  id: string,
): Promise<boolean> {
  const table = kind === 'claim' ? 'moderation_queue_claims' : 'moderation_media_reveals'
  const { rows } = await read<{ id: string }>(
    `/* moderationRetentionRowExists */ SELECT id FROM ${table} WHERE id = $1::uuid`,
    [id],
  )
  return rows.length > 0
}

export async function deleteTestModerationRetentionRows(
  kind: 'claim' | 'reveal',
  ids: readonly string[],
): Promise<void> {
  const table = kind === 'claim' ? 'moderation_queue_claims' : 'moderation_media_reveals'
  await write(
    `/* deleteTestModerationRetentionRows */ DELETE FROM ${table} WHERE id = ANY($1::uuid[])`,
    [ids],
  )
}

export async function setTestModerationRetentionActivity(
  kind: 'claim' | 'reveal',
  id: string,
  at: Date,
): Promise<void> {
  const table = kind === 'claim' ? 'moderation_queue_claims' : 'moderation_media_reveals'
  const column = kind === 'claim' ? 'claimed_at' : 'revealed_at'
  await write(
    `/* setTestModerationRetentionActivity */ UPDATE ${table} SET ${column} = $2::timestamptz WHERE id = $1::uuid`,
    [id, at],
  )
}
