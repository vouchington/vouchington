import { read, write } from '@data-stores/psql'

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
