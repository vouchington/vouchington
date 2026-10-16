import { beginTransaction, type TransactionQuery } from '@data-stores/psql'
import { onTestFinished } from 'vitest'
import { createRetainedBindingCleanupLifetime } from './retained-binding-cleanup-lifetime.mts'

/** Stage an absent singleton privately; the real cleanup and all assertions share its rollback. */
export function withTestRetainedBindingCleanupCursor<Result>(
  run: (query: TransactionQuery) => Promise<Result>,
): Promise<Result> {
  let transaction: Awaited<ReturnType<typeof beginTransaction>> | undefined
  const lifetime = createRetainedBindingCleanupLifetime<Result>(
    {
      rollback: async () => {
        await transaction?.rollback()
      },
      dispose: async () => {
        await transaction?.[Symbol.asyncDispose]()
      },
    },
    onTestFinished,
  )
  // The lifetime already registered the sole cleanup hook before acquisition or any fixture.
  return lifetime.run(async () => {
    transaction = await lifetime.admit(() => beginTransaction())
    lifetime.assertOpen()
    const query = lifetime.guard(transaction)
    await query(`/* reserveRetainedBindingCleanupProof */
      INSERT INTO retained_image_placement_binding_cleanup_cursors (is_singleton)
      VALUES (TRUE) ON CONFLICT DO NOTHING`)
    await query(`/* reserveRetainedBindingCleanupProof */
      SELECT cursor_placement_id FROM retained_image_placement_binding_cleanup_cursors
      WHERE is_singleton FOR UPDATE`)
    await query(`/* stageAbsentRetainedBindingCleanupCursor */
      DELETE FROM retained_image_placement_binding_cleanup_cursors WHERE is_singleton`)
    return run(query)
  })
}
