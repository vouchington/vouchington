import { read, write } from '@data-stores/psql'

export async function setTestRetainedBindingCleanupCursor(
  cursorPlacementId: string | null,
): Promise<void> {
  await write(
    `/* setTestRetainedBindingCleanupCursor */
     INSERT INTO retained_image_placement_binding_cleanup_cursors (is_singleton, cursor_placement_id)
     VALUES (TRUE, $1)
     ON CONFLICT (is_singleton) DO UPDATE SET cursor_placement_id = EXCLUDED.cursor_placement_id`,
    [cursorPlacementId],
  )
}

export async function clearTestRetainedBindingCleanupCursor(): Promise<void> {
  await write(`/* clearTestRetainedBindingCleanupCursor */
    DELETE FROM retained_image_placement_binding_cleanup_cursors`)
}

export async function getTestRetainedBindingCleanupCursor(): Promise<string | null | undefined> {
  const { rows } = await read<{ cursor_placement_id: string | null }>(
    `/* getTestRetainedBindingCleanupCursor */ SELECT cursor_placement_id
      FROM retained_image_placement_binding_cleanup_cursors WHERE is_singleton`,
  )
  return rows[0]?.cursor_placement_id
}
