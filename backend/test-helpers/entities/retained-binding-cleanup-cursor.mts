import type { TransactionQuery } from '@data-stores/psql'

export async function getTestRetainedBindingCleanupCursor(
  query: TransactionQuery,
): Promise<string | null | undefined> {
  const { rows } = await query<{ cursor_placement_id: string | null }>(
    `/* getTestRetainedBindingCleanupCursor */ SELECT cursor_placement_id
      FROM retained_image_placement_binding_cleanup_cursors WHERE is_singleton`,
  )
  return rows[0]?.cursor_placement_id
}
