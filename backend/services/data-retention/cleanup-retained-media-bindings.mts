import { beginTransaction } from '@data-stores/psql'
import { observeSharedDbScope, sharedDbIdsScope } from '@data-stores/psql/shared-db-scope-observer'

export type RetainedMediaBindingCleanupPage = {
  scanned: number
  deleted: number
  hasMore: boolean
}

/** A separate bounded transaction; marker acknowledgement never holds cleanup locks. */
export async function cleanupRetainedMediaBindings(
  pageSize = 1_000,
  placementIds?: readonly string[],
): Promise<RetainedMediaBindingCleanupPage> {
  if (!Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 1_000) {
    throw new RangeError('Retained media binding cleanup page size must be between 1 and 1000')
  }
  if (placementIds && placementIds.length > pageSize)
    throw new RangeError('Scoped retained media cleanup must fit one page')
  if (placementIds?.length === 0) return { scanned: 0, deleted: 0, hasMore: false }
  observeSharedDbScope('cleanupRetainedMediaBindings', sharedDbIdsScope(placementIds))
  await using query = await beginTransaction()
  const progress = placementIds
    ? null
    : (
        await query<{ cursor_identity_id: string | null }>(
          `/* lockRetainedMediaBindingCleanupProgress */
           SELECT cursor_identity_id FROM retained_identity_cleanup_progress
           WHERE family = 'image_placement_binding' FOR UPDATE`,
        )
      ).rows[0]
  const { rows: candidates } = await query<{ placement_id: string; image_id: string }>(
    `/* listRetainedMediaBindingCleanupCandidates */
     SELECT placement_id, image_id FROM retained_image_placement_bindings
     WHERE ($1::uuid[] IS NOT NULL AND placement_id = ANY($1::uuid[]))
        OR ($1::uuid[] IS NULL AND ($2::uuid IS NULL OR placement_id > $2::uuid))
     ORDER BY placement_id LIMIT $3`,
    [placementIds ?? null, progress?.cursor_identity_id ?? null, pageSize + 1],
  )
  const page = candidates.slice(0, pageSize)
  const pagePlacementIds = page.map(row => row.placement_id)
  const { rows: images } = await query<{ id: string }>(
    `/* lockRetainedMediaBindingImages */
     SELECT root.id FROM retained_image_identities root
     JOIN (SELECT DISTINCT image_id FROM retained_image_placement_bindings
       WHERE placement_id = ANY($1::uuid[])) requested ON requested.image_id = root.id
     ORDER BY root.id FOR UPDATE OF root SKIP LOCKED`,
    [pagePlacementIds],
  )
  const { rows: locked } = await query<{ placement_id: string }>(
    `/* lockRetainedMediaBindings */
     SELECT placement_id FROM retained_image_placement_bindings
     WHERE placement_id = ANY($1::uuid[]) AND image_id = ANY($2::uuid[])
     ORDER BY placement_id FOR UPDATE SKIP LOCKED`,
    [pagePlacementIds, images.map(row => row.id)],
  )
  const { rowCount } = await query(
    `/* deleteUnreferencedRetainedMediaBindings */
     DELETE FROM retained_image_placement_bindings binding
     WHERE placement_id = ANY($1::uuid[])
       AND NOT EXISTS (SELECT 1 FROM media_placements live WHERE live.id = binding.placement_id)
       AND NOT EXISTS (SELECT 1 FROM media_delivery_registry_records registry
         WHERE registry.placement_id = binding.placement_id)
       `,
    [locked.map(row => row.placement_id)],
  )
  const hasMore = candidates.length > pageSize
  if (!placementIds)
    await query(
      `/* checkpointRetainedMediaBindingCleanup */
       UPDATE retained_identity_cleanup_progress
       SET cursor_identity_id = $1, updated_at = CURRENT_TIMESTAMP
       WHERE family = 'image_placement_binding'`,
      [hasMore ? page.at(-1)!.placement_id : null],
    )
  await query.commit()
  return { scanned: page.length, deleted: rowCount ?? 0, hasMore }
}
