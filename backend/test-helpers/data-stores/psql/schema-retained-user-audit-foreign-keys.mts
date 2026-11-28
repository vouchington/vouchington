import { beginTransaction } from '@data-stores/psql'
import {
  countTestRetainedUserAuditRows,
  insertTestRetainedUserAuditRow,
  type RetainedUserAuditTable,
} from '../../entities/retained-user-audit-references.mts'

export async function insertRetainedUserAuditRowInTransaction(
  table: RetainedUserAuditTable,
  actorId: string,
  postId: string,
): Promise<void> {
  await using query = await beginTransaction()
  await insertTestRetainedUserAuditRow(query, table, actorId, postId)
}

export async function insertClearanceChangeAndCountRetainedActor(
  actorId: string,
  postId: string,
): Promise<{ retainedRootCount: number | null; auditRowCount: number }> {
  await using query = await beginTransaction()
  await insertTestRetainedUserAuditRow(query, 'post_clearance_changes', actorId, postId)
  const { rowCount: retainedRootCount } = await query(
    '/* testSchemaRetainedUserAuditForeignKeys */ SELECT id FROM retained_user_identities WHERE id = $1',
    [actorId],
  )
  const auditRowCount = await countTestRetainedUserAuditRows(
    query,
    'post_clearance_changes',
    actorId,
  )
  return { retainedRootCount, auditRowCount }
}

export async function hardDeleteUserWithRetainedAudit(
  table: RetainedUserAuditTable,
  userId: string,
  postId: string,
): Promise<{ auditRowCount: number; retainedRootCount: number | null }> {
  await using query = await beginTransaction()
  await insertTestRetainedUserAuditRow(query, table, userId, postId)
  await query('/* hardDeleteUserWithRetainedAudit */ DELETE FROM users WHERE id = $1', [userId])
  const auditRowCount = await countTestRetainedUserAuditRows(query, table, userId)
  const { rowCount: retainedRootCount } = await query(
    '/* readRetainedUserRootAfterDelete */ SELECT 1 FROM retained_user_identities WHERE id = $1',
    [userId],
  )
  return { auditRowCount, retainedRootCount }
}

export async function deleteReferencedRetainedUserRootAfterLiveDelete(
  table: RetainedUserAuditTable,
  userId: string,
  postId: string,
): Promise<void> {
  await using query = await beginTransaction()
  await insertTestRetainedUserAuditRow(query, table, userId, postId)
  await query('/* hardDeleteUserWithRetainedAudit */ DELETE FROM users WHERE id = $1', [userId])
  await query(
    '/* deleteReferencedRetainedUserRoot */ DELETE FROM retained_user_identities WHERE id = $1',
    [userId],
  )
}
