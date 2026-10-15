import { allowUnannotatedQuery } from '@data-stores/psql/prepared-statement-name'
import {
  beginTransaction,
  read,
  withTransactionOptions,
  type TransactionQuery,
} from '@data-stores/psql'

/** Seeds an unreferenced pair to exercise bounded orphan cleanup without a live owner. */
type RetainedMediaOrphan = {
  imageId: string
  placementId: string
  bindingFamily: 'post' | 'surface'
}

export async function seedTestRetainedMediaOrphan(
  input: RetainedMediaOrphan,
  borrowedQuery?: TransactionQuery,
): Promise<void> {
  if (borrowedQuery)
    return withTransactionOptions({ query: borrowedQuery }, query =>
      seedRetainedMediaOrphan(query, input),
    )
  await using query = await beginTransaction()
  await seedRetainedMediaOrphan(query, input)
  await query.commit()
}

async function seedRetainedMediaOrphan(
  query: TransactionQuery,
  input: RetainedMediaOrphan,
): Promise<void> {
  const { rows: uploaders } = await query<{ id: string }>(
    '/* seedTestRetainedMediaOrphan:uploader */ INSERT INTO retained_user_identities (id) VALUES (uuidv7()) RETURNING id',
  )
  await query(
    '/* seedTestRetainedMediaOrphan:image */ INSERT INTO retained_image_identities (id, created_by_id) VALUES ($1, $2)',
    [input.imageId, uploaders[0]!.id],
  )
  await query(
    allowUnannotatedQuery(
      'INSERT INTO retained_image_placement_bindings (placement_id, image_id, binding_family) VALUES ($1, $2, $3)',
    ),
    [input.placementId, input.imageId, input.bindingFamily],
  )
}

export async function hasTestRetainedImageIdentity(imageId: string): Promise<boolean> {
  const { rowCount } = await read(
    '/* hasTestRetainedImageIdentity */ SELECT id FROM retained_image_identities WHERE id = $1',
    [imageId],
  )
  return (rowCount ?? 0) > 0
}

export async function hasTestRetainedMediaBinding(
  placementId: string,
  query?: TransactionQuery,
): Promise<boolean> {
  const { rowCount } = await (query ?? read)(
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
