import { beginTransaction, read } from '@data-stores/psql'

export type RetainedMediaForeignKey = {
  owner: string
  target: string
  definition: string
}

export async function readRetainedMediaForeignKeys(): Promise<RetainedMediaForeignKey[]> {
  const { rows } = await read<RetainedMediaForeignKey>(
    `/* readRetainedMediaForeignKeys */
      SELECT conrelid::regclass::text AS owner, confrelid::regclass::text AS target,
        pg_get_constraintdef(oid) AS definition
      FROM pg_constraint
      WHERE contype = 'f' AND confrelid IN
        ('retained_image_identities'::regclass,
         'retained_image_placement_bindings'::regclass)`,
  )
  return rows
}

export type RetainedMediaFamilyCheck = {
  owner: string
  definition: string
}

export async function readRetainedMediaFamilyChecks(): Promise<RetainedMediaFamilyCheck[]> {
  const { rows } = await read<RetainedMediaFamilyCheck>(
    `/* readRetainedMediaFamilyChecks */
      SELECT conrelid::regclass::text AS owner, pg_get_constraintdef(oid) AS definition
      FROM pg_constraint WHERE contype = 'c' AND conrelid IN
        ('image_placements'::regclass, 'image_surface_placements'::regclass)
        AND pg_get_constraintdef(oid) LIKE '%binding_family%'`,
  )
  return rows
}

export async function readRegistryBackedMarkerKeys(): Promise<{ definition: string }[]> {
  const { rows } = await read<{ definition: string }>(
    `/* readRegistryBackedMarkerKey */ SELECT pg_get_constraintdef(oid) AS definition
      FROM pg_constraint WHERE contype = 'f'
        AND conrelid = 'media_delivery_repair_markers'::regclass`,
  )
  return rows
}

export async function insertSurfaceChildForPostFamilyBinding(
  userId: string,
  imageId: string,
): Promise<void> {
  await using query = await beginTransaction()
  const { rows } = await query<{ placement_id: string }>(
    '/* allocateWrongFamilyPlacement */ SELECT uuidv7() AS placement_id',
  )
  const placementId = rows[0]!.placement_id
  await query(
    "/* reservePostFamilyPlacement */ INSERT INTO retained_image_placement_bindings (placement_id, image_id, binding_family) VALUES ($1, $2, 'post')",
    [placementId, imageId],
  )
  await query('/* createWrongFamilyParent */ INSERT INTO media_placements (id) VALUES ($1)', [
    placementId,
  ])
  await query(
    "/* rejectWrongFamilyChild */ INSERT INTO image_surface_placements (placement_id, surface_kind, image_id, user_id) VALUES ($1, 'user-profile-image', $2, $3)",
    [placementId, imageId, userId],
  )
}

export async function insertRegistryRecordWithWrongImage(
  imageId: string,
  wrongImageId: string,
): Promise<void> {
  await using query = await beginTransaction()
  const { rows } = await query<{ placement_id: string }>(
    '/* allocateWrongPairPlacement */ SELECT uuidv7() AS placement_id',
  )
  const placementId = rows[0]!.placement_id
  await query(
    "/* reserveWrongPairPlacement */ INSERT INTO retained_image_placement_bindings (placement_id, image_id, binding_family) VALUES ($1, $2, 'post')",
    [placementId, imageId],
  )
  await query('/* createWrongPairParent */ INSERT INTO media_placements (id) VALUES ($1)', [
    placementId,
  ])
  await query(
    "/* rejectWrongRegistryPair */ INSERT INTO media_delivery_registry_records (id, placement_id, placement_revision, image_id, desired_state) VALUES (uuidv7(), $1, 0, $2, 'withheld')",
    [placementId, wrongImageId],
  )
}

export async function mutateReservedRetainedBinding(
  field: 'placement_id' | 'image_id' | 'binding_family',
): Promise<void> {
  await using query = await beginTransaction()
  const { rows: identities } = await query<{
    image_id: string
    other_image_id: string
    placement_id: string
    other_placement_id: string
  }>(
    '/* allocateRetainedMediaMutationIds */ SELECT uuidv7() AS image_id, uuidv7() AS other_image_id, uuidv7() AS placement_id, uuidv7() AS other_placement_id',
  )
  const {
    image_id: imageId,
    other_image_id: otherImageId,
    placement_id: placementId,
    other_placement_id: otherPlacementId,
  } = identities[0]!
  const { rows: uploaders } = await query<{ id: string }>(
    '/* createRetainedImagesForMutation:uploader */ INSERT INTO retained_user_identities (id) VALUES (uuidv7()) RETURNING id',
  )
  await query(
    '/* createRetainedImagesForMutation */ INSERT INTO retained_image_identities (id, created_by_id) VALUES ($1, $3), ($2, $3)',
    [imageId, otherImageId, uploaders[0]!.id],
  )
  await query(
    "/* createRetainedBindingForMutation */ INSERT INTO retained_image_placement_bindings (placement_id, image_id, binding_family) VALUES ($1, $2, 'post')",
    [placementId, imageId],
  )
  if (field === 'placement_id') {
    await query(
      '/* rejectRetainedBindingMutation */ UPDATE retained_image_placement_bindings SET placement_id = $2 WHERE placement_id = $1',
      [placementId, otherPlacementId],
    )
  } else if (field === 'image_id') {
    await query(
      '/* rejectRetainedBindingMutation */ UPDATE retained_image_placement_bindings SET image_id = $2 WHERE placement_id = $1',
      [placementId, otherImageId],
    )
  } else {
    await query(
      '/* rejectRetainedBindingMutation */ UPDATE retained_image_placement_bindings SET binding_family = $2 WHERE placement_id = $1',
      [placementId, 'surface'],
    )
  }
}

export async function insertUnknownRegistryMarker(): Promise<void> {
  await using query = await beginTransaction()
  const { rows: identities } = await query<{ record_id: string }>(
    '/* allocateUnknownMarkerIds */ SELECT uuidv7() AS record_id',
  )
  await query(
    '/* rejectUnknownRegistryMarker */ INSERT INTO media_delivery_repair_markers (media_delivery_registry_record_id, marker_token) VALUES ($1, 1)',
    [identities[0]!.record_id],
  )
}
