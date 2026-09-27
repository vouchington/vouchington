import type { TransactionQuery } from '@data-stores/psql/types'
import sql from 'sql-template-strings'

export type ImageBindingFamily = 'post' | 'surface'

export type ImagePlacementBinding = {
  placementId: string
  imageId: string
  bindingFamily: ImageBindingFamily
}

/** Creates or pins the exact retained pair in the live owner's transaction. */
export async function ensureImagePlacementBinding(
  query: TransactionQuery,
  input: ImagePlacementBinding,
): Promise<void> {
  const { rowCount: imageCount } = await query(sql`/* ensureImagePlacementBinding:image */
    SELECT id FROM retained_image_identities WHERE id = ${input.imageId} FOR KEY SHARE
  `)
  if (imageCount !== 1) throw new Error('Missing retained image identity for placement')

  await query(sql`/* ensureImagePlacementBinding:insert */
    INSERT INTO retained_image_placement_bindings (placement_id, image_id, binding_family)
    VALUES (${input.placementId}, ${input.imageId}, ${input.bindingFamily})
    ON CONFLICT (placement_id) DO NOTHING
  `)
  const { rowCount: bindingCount } = await query(sql`/* ensureImagePlacementBinding:pin */
    SELECT placement_id FROM retained_image_placement_bindings
    WHERE placement_id = ${input.placementId}
      AND image_id = ${input.imageId}
      AND binding_family = ${input.bindingFamily}
    FOR KEY SHARE
  `)
  if (bindingCount !== 1) {
    throw new Error('Image placement identity is already bound to another image or family')
  }
}
