import { v7 } from 'uuid'
import { beginTransaction, read, write } from '@data-stores/psql'
import sql from 'sql-template-strings'

export async function createTestCompletedDeletionProof(completedAt: Date): Promise<string> {
  const userId = v7()
  const { rows } = await write<{ id: string }>(sql`
    /* createTestCompletedDeletionProof */
    WITH identity AS (INSERT INTO retained_user_identities (id) VALUES (${userId}) RETURNING id)
    INSERT INTO user_deletion_requests (user_id, completed_at)
    SELECT id, ${completedAt} FROM identity RETURNING id`)
  return rows[0]!.id
}

export async function createTestReleasedLegalHold(releasedAt: Date): Promise<string> {
  const accountId = v7()
  const actorId = v7()
  const { rows } = await write<{ id: string }>(sql`
    /* createTestReleasedLegalHold */
    WITH identities AS (
      INSERT INTO retained_user_identities (id) VALUES (${accountId}), (${actorId}) RETURNING id
    )
    INSERT INTO user_legal_preservation_holds (
      account_user_id, placed_by_id, reference_ciphertext, released_at, released_by_id)
    SELECT ${accountId}, ${actorId}, 'synthetic-matter', ${releasedAt}, ${actorId}
    WHERE (SELECT count(*) FROM identities) = 2 RETURNING id`)
  return rows[0]!.id
}

export async function legalRecordExists(
  table: 'user_deletion_requests' | 'user_legal_preservation_holds',
  id: string,
): Promise<boolean> {
  const { rows } = await read<{ exists: boolean }>(
    `/* legalRecordExists */ SELECT EXISTS (SELECT 1 FROM ${table} WHERE id = $1::uuid) AS exists`,
    [id],
  )
  return rows[0]!.exists
}

/** Exercise the production trigger with the cleanup flag but a still-young hold. */
export async function attemptYoungReleasedHoldDeletion(id: string): Promise<void> {
  await using probe = await beginTransaction()
  await probe(sql`/* enableYoungLegalHoldRetentionProbe */
    SET LOCAL app.legal_record_retention_delete = 'on'`)
  await probe(sql`/* rejectYoungReleasedHoldDeletion */
    DELETE FROM user_legal_preservation_holds WHERE id = ${id}`)
}
