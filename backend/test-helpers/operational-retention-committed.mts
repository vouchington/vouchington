import { beginTransaction } from '@data-stores/psql'
import { cleanupOperationalTombstonePageForTest } from './operational-retention-scopes.mts'

type CursorSnapshot = {
  cursor_at: string | null
  cursor_record_id: string | null
  sweep_cutoff_at: string | null
}

/** Commit owned cache deletion while preserving cursor position/cutoff; updated_at remains trigger-owned. */
export async function cleanupCommittedRemoteActorCacheForTest(actorId: string, now: Date) {
  await using query = await beginTransaction()
  const created = await query(
    `/* ensureOwnedRemoteActorRetentionCursorForTest */
     INSERT INTO operational_tombstone_retention_cursors (cleanup_name)
     VALUES ('remote_actors') ON CONFLICT DO NOTHING`,
  )
  const { rows } = await query<CursorSnapshot>(
    `/* lockOwnedRemoteActorRetentionCursorForTest */
     SELECT cursor_at::text AS cursor_at, cursor_record_id, sweep_cutoff_at::text AS sweep_cutoff_at
     FROM operational_tombstone_retention_cursors
     WHERE cleanup_name = 'remote_actors' FOR UPDATE`,
  )
  const previous = rows[0]
  if (!previous) throw new Error('Expected the locked remote actor retention cursor')
  // The fixture's future-dated exact ID must be considered independently of a sibling's position.
  await query(
    `/* initializeOwnedRemoteActorRetentionCursorForTest */
     UPDATE operational_tombstone_retention_cursors
     SET cursor_at = NULL, cursor_record_id = NULL, sweep_cutoff_at = NULL
     WHERE cleanup_name = 'remote_actors'`,
  )
  const result = await cleanupOperationalTombstonePageForTest('remote_actors', {
    borrowedQuery: query,
    ids: [actorId],
    batchSize: 1,
    now,
  })
  if (created.rowCount === 1) {
    // This transaction created the singleton; do not publish fixture-created work tracking state.
    await query(
      `/* deleteOwnedRemoteActorRetentionCursorForTest */
       DELETE FROM operational_tombstone_retention_cursors WHERE cleanup_name = 'remote_actors'`,
    )
  } else {
    await query(
      `/* restoreOwnedRemoteActorRetentionCursorForTest */
       UPDATE operational_tombstone_retention_cursors
       SET cursor_at = $1::timestamptz, cursor_record_id = $2::uuid,
           sweep_cutoff_at = $3::timestamptz
       WHERE cleanup_name = 'remote_actors'`,
      [previous.cursor_at, previous.cursor_record_id, previous.sweep_cutoff_at],
    )
  }
  await query.commit()
  return result
}

export async function deleteRemoteActorRetentionFixtureForTest(actorId: string): Promise<void> {
  await using query = await beginTransaction()
  await query(
    '/* deleteRemoteActorRetentionCacheFixtureForTest */ DELETE FROM remote_actors WHERE id = $1::uuid',
    [actorId],
  )
  await query(
    '/* deleteRemoteActorRetentionIdentityFixtureForTest */ DELETE FROM remote_actor_identities WHERE id = $1::uuid',
    [actorId],
  )
  await query.commit()
}
