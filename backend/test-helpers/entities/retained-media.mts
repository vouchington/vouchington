import { read } from '@data-stores/psql'

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
