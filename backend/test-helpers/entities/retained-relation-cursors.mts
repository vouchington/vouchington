import { read, write } from '@data-stores/psql'

export type TestRetainedRelationCleanupCursor = {
  cursor_subject_id: string | null
  cursor_relation_id: string | null
}

export async function readTestRetainedRelationCleanupCursor(
  entityRelation: string,
): Promise<TestRetainedRelationCleanupCursor | null> {
  const { rows } = await read<TestRetainedRelationCleanupCursor>(
    `/* readTestRetainedRelationCleanupCursor */
     SELECT cursor_subject_id, cursor_relation_id
     FROM retained_relation_identity_cleanup_cursors
     WHERE entity_relation = $1`,
    [entityRelation],
  )
  return rows[0] ?? null
}

export async function restoreTestRetainedRelationCleanupCursor(
  entityRelation: string,
  cursor: TestRetainedRelationCleanupCursor | null,
): Promise<void> {
  if (!cursor) {
    await write(
      `/* deleteTestRetainedRelationCleanupCursor */
       DELETE FROM retained_relation_identity_cleanup_cursors WHERE entity_relation = $1`,
      [entityRelation],
    )
    return
  }
  await write(
    `/* restoreTestRetainedRelationCleanupCursor */
     INSERT INTO retained_relation_identity_cleanup_cursors (
       entity_relation, cursor_subject_id, cursor_relation_id
     ) VALUES ($1, $2, $3)
     ON CONFLICT (entity_relation) DO UPDATE
     SET cursor_subject_id = EXCLUDED.cursor_subject_id,
         cursor_relation_id = EXCLUDED.cursor_relation_id`,
    [entityRelation, cursor.cursor_subject_id, cursor.cursor_relation_id],
  )
}

export async function getRetainedRelationCleanupCursors(): Promise<string[]> {
  const { rows } = await read<{ entity_relation: string }>(
    'SELECT entity_relation FROM retained_relation_identity_cleanup_cursors ORDER BY entity_relation',
  )
  return rows.map(row => row.entity_relation)
}
