import { beginTransaction, write } from '@data-stores/psql'
import type { TransactionQuery } from '@data-stores/psql/types'
import sql from 'sql-template-strings'

export type ImageBindingFamily = 'post' | 'surface'

export type ImagePlacementBinding = {
  placementId: string
  imageId: string
  bindingFamily: ImageBindingFamily
}

/** Commits the byte identity independently of any later live image insertion. */
export async function reserveImageIdentity(imageId: string): Promise<void> {
  await write(
    sql`/* reserveImageIdentity */ SELECT fn_ensure_retained_image_identity(${imageId}::uuid)`,
  )
}

/** Reservation is identity only, never evidence that an image or placement is live or authorized. */
export async function reserveImagePlacementBinding(input: ImagePlacementBinding): Promise<void> {
  await using query = await beginTransaction()
  await query(sql`/* reserveImagePlacementBinding:image */
    SELECT fn_ensure_retained_image_identity(${input.imageId}::uuid)
  `)
  await query(sql`/* reserveImagePlacementBinding:insert */
    INSERT INTO retained_image_placement_bindings (placement_id, image_id, binding_family)
    VALUES (${input.placementId}, ${input.imageId}, ${input.bindingFamily})
    ON CONFLICT (placement_id) DO NOTHING
  `)
  const { rows } = await query<{ matches: boolean }>(sql`
    /* reserveImagePlacementBinding:verify */
    SELECT image_id = ${input.imageId}::uuid AND binding_family = ${input.bindingFamily} AS matches
    FROM retained_image_placement_bindings
    WHERE placement_id = ${input.placementId} FOR KEY SHARE
  `)
  if (!rows[0]?.matches) {
    throw new Error('Image placement identity is already reserved for another image or family')
  }
  await query.commit()
}

/** Owner transactions acquire compatible pins in image-then-binding order. */
export async function pinImagePlacementBinding(
  query: TransactionQuery,
  input: Pick<ImagePlacementBinding, 'placementId' | 'imageId'> &
    Partial<Pick<ImagePlacementBinding, 'bindingFamily'>>,
): Promise<boolean> {
  const { rowCount: imageCount } = await query(sql`/* pinImagePlacementBinding:image */
    SELECT id FROM retained_image_identities WHERE id = ${input.imageId} FOR KEY SHARE
  `)
  if (imageCount !== 1) return false
  const { rowCount: bindingCount } = await query(sql`/* pinImagePlacementBinding:pair */
    SELECT placement_id FROM retained_image_placement_bindings
    WHERE placement_id = ${input.placementId} AND image_id = ${input.imageId}
      AND (${input.bindingFamily ?? null}::text IS NULL OR binding_family = ${input.bindingFamily ?? null})
    FOR KEY SHARE
  `)
  return bindingCount === 1
}

/** Fresh owners retry a concurrent orphan sweep, then hold both pins through their commit. */
export async function reserveAndPinImagePlacementBinding(
  query: TransactionQuery,
  input: ImagePlacementBinding,
): Promise<void> {
  for (;;) {
    // oxlint-disable-next-line no-await-in-loop -- independent reservation can race a bounded orphan sweep before the owner pin.
    await reserveImagePlacementBinding(input)
    // oxlint-disable-next-line no-await-in-loop -- owner retains successful pins until commit.
    if (await pinImagePlacementBinding(query, input)) return
  }
}

/** Markers are find-only: a missing pair cannot be inferred from an uncommitted owner. */
export async function pinExistingImagePlacementBinding(
  query: TransactionQuery,
  input: Pick<ImagePlacementBinding, 'placementId' | 'imageId'>,
): Promise<void> {
  if (!(await pinImagePlacementBinding(query, input))) {
    throw new Error('Missing retained image placement identity for delivery repair')
  }
}

export async function pinExistingImageIdentity(
  query: TransactionQuery,
  imageId: string,
): Promise<void> {
  const { rowCount } = await query(sql`/* pinExistingImageIdentity */
    SELECT id FROM retained_image_identities WHERE id = ${imageId} FOR KEY SHARE
  `)
  if (rowCount !== 1) throw new Error('Missing retained image identity for delivery repair')
}
