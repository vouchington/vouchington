import { beginTransaction, read } from '@data-stores/psql'

/** Seeds an unreferenced pair to exercise bounded orphan cleanup without a live owner. */
export async function seedTestRetainedMediaOrphan(input: {
  imageId: string
  placementId: string
  bindingFamily: 'post' | 'surface'
}): Promise<void> {
  await using query = await beginTransaction()
  const { rows: uploaders } = await query<{ id: string }>(
    '/* seedTestRetainedMediaOrphan:uploader */ INSERT INTO retained_user_identities (id) VALUES (uuidv7()) RETURNING id',
  )
  await query(
    '/* seedTestRetainedMediaOrphan:image */ INSERT INTO retained_image_identities (id, created_by_id) VALUES ($1, $2)',
    [input.imageId, uploaders[0]!.id],
  )
  await query(
    'INSERT INTO retained_image_placement_bindings (placement_id, image_id, binding_family) VALUES ($1, $2, $3)',
    [input.placementId, input.imageId, input.bindingFamily],
  )
  await query.commit()
}

export async function hasTestRetainedImageIdentity(imageId: string): Promise<boolean> {
  const { rowCount } = await read(
    '/* hasTestRetainedImageIdentity */ SELECT id FROM retained_image_identities WHERE id = $1',
    [imageId],
  )
  return (rowCount ?? 0) > 0
}

export async function hasTestRetainedMediaBinding(placementId: string): Promise<boolean> {
  const { rowCount } = await read(
    '/* hasTestRetainedMediaBinding */ SELECT placement_id FROM retained_image_placement_bindings WHERE placement_id = $1',
    [placementId],
  )
  return (rowCount ?? 0) > 0
}

export async function readTestRetainedMediaTraversalBound(pageSize: number): Promise<number> {
  const { rows } = await read<{ count: string }>(
    '/* readTestRetainedMediaTraversalBound */ SELECT count(*)::text AS count FROM retained_image_placement_bindings',
  )
  return Math.ceil(Number(rows[0]!.count) / pageSize) + 2
}

export async function pinTestRetainedMediaIdentity(
  query: import('@data-stores/psql/types').TransactionQuery,
  imageId: string,
  placementId: string,
): Promise<void> {
  await query(
    '/* pinTestRetainedMediaIdentity:image */ SELECT id FROM retained_image_identities WHERE id = $1 FOR KEY SHARE',
    [imageId],
  )
  await query(
    '/* pinTestRetainedMediaIdentity:binding */ SELECT placement_id FROM retained_image_placement_bindings WHERE placement_id = $1 FOR KEY SHARE',
    [placementId],
  )
}
