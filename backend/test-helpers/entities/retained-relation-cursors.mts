import { read, write } from '@data-stores/psql'

export async function clearRetainedRelationCleanupCursors(): Promise<void> {
  await write('DELETE FROM retained_relation_identity_cleanup_cursors')
}

export async function getRetainedRelationCleanupCursors(): Promise<string[]> {
  const { rows } = await read<{ entity_relation: string }>(
    'SELECT entity_relation FROM retained_relation_identity_cleanup_cursors ORDER BY entity_relation',
  )
  return rows.map(row => row.entity_relation)
}
