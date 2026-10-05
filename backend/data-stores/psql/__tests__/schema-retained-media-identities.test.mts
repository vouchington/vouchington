import { afterAll, describe, expect, it } from 'vitest'
import { beginTransaction, onGracefulShutdown, read } from '../index.mts'

describe('concrete retained media identities', () => {
  afterAll(onGracefulShutdown)

  it('declares partitioned image and immutable placement binding owners', async () => {
    const { rows: partitions } = await read<{ parent: string; child: string }>(
      `/* readRetainedMediaPartitions */
       SELECT inhparent::regclass::text AS parent, inhrelid::regclass::text AS child
       FROM pg_inherits WHERE inhparent IN
         ('retained_image_identities'::regclass,
          'retained_image_placement_bindings'::regclass)`,
    )
    expect(partitions).toEqual(
      expect.arrayContaining([
        { parent: 'retained_image_identities', child: 'retained_image_identities_default' },
        {
          parent: 'retained_image_placement_bindings',
          child: 'retained_image_placement_bindings_default',
        },
      ]),
    )
    const { rows: triggers } = await read<{ trigger_name: string }>(
      `/* readRetainedMediaBindingGuard */
       SELECT tgname AS trigger_name FROM pg_trigger
       WHERE tgrelid = 'retained_image_placement_bindings'::regclass AND NOT tgisinternal`,
    )
    expect(triggers).toContainEqual({
      trigger_name: 'trigger_guard_retained_image_placement_binding',
    })
  })

  it('constrains live children and registry to the exact retained pair', async () => {
    const { rows } = await read<{ owner: string; target: string; definition: string }>(
      `/* readRetainedMediaForeignKeys */
       SELECT conrelid::regclass::text AS owner, confrelid::regclass::text AS target,
         pg_get_constraintdef(oid) AS definition
       FROM pg_constraint
       WHERE contype = 'f' AND confrelid IN
         ('retained_image_identities'::regclass,
          'retained_image_placement_bindings'::regclass)`,
    )
    for (const owner of ['image_placements', 'image_surface_placements']) {
      expect(rows).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            owner,
            target: 'retained_image_placement_bindings',
            definition: expect.stringContaining(
              'FOREIGN KEY (placement_id, image_id, binding_family)',
            ),
          }),
        ]),
      )
    }
    expect(rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          owner: 'media_delivery_registry_records',
          target: 'retained_image_placement_bindings',
          definition: expect.stringContaining('FOREIGN KEY (placement_id, image_id)'),
        }),
      ]),
    )
    expect(rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ owner: 'images', target: 'retained_image_identities' }),
        expect.objectContaining({
          owner: 'media_placements',
          target: 'retained_image_placement_bindings',
        }),
      ]),
    )
    const { rows: familyChecks } = await read<{ owner: string; definition: string }>(
      `/* readRetainedMediaFamilyChecks */
       SELECT conrelid::regclass::text AS owner, pg_get_constraintdef(oid) AS definition
       FROM pg_constraint WHERE contype = 'c' AND conrelid IN
         ('image_placements'::regclass, 'image_surface_placements'::regclass)
         AND pg_get_constraintdef(oid) LIKE '%binding_family%'`,
    )
    expect(familyChecks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          owner: 'image_placements',
          definition: expect.stringContaining("'post'"),
        }),
        expect.objectContaining({
          owner: 'image_surface_placements',
          definition: expect.stringContaining("'surface'"),
        }),
      ]),
    )
    const { rows: markerKeys } = await read<{ definition: string }>(
      `/* readRegistryBackedMarkerKey */ SELECT pg_get_constraintdef(oid) AS definition
       FROM pg_constraint WHERE contype = 'f'
         AND conrelid = 'media_delivery_repair_markers'::regclass`,
    )
    expect(markerKeys).toEqual([
      expect.objectContaining({
        definition: expect.stringContaining(
          'FOREIGN KEY (delivery_key) REFERENCES media_delivery_registry_records(delivery_key)',
        ),
      }),
    ])
  })

  it.each(['placement_id', 'image_id', 'binding_family'] as const)(
    'rejects mutation of reserved binding %s',
    async field => {
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
      const updates = {
        placement_id: { sql: 'placement_id = $2', value: otherPlacementId },
        image_id: { sql: 'image_id = $2', value: otherImageId },
        binding_family: { sql: 'binding_family = $2', value: 'surface' },
      }
      const update = updates[field]
      await expect(
        query(
          `/* rejectRetainedBindingMutation */ UPDATE retained_image_placement_bindings SET ${update.sql} WHERE placement_id = $1`,
          [placementId, update.value],
        ),
      ).rejects.toMatchObject({ code: '23514' })
    },
  )

  it('rejects a repair marker without a committed registry parent', async () => {
    await using query = await beginTransaction()
    const { rows: identities } = await query<{ image_id: string; placement_id: string }>(
      '/* allocateUnknownMarkerIds */ SELECT uuidv7() AS image_id, uuidv7() AS placement_id',
    )
    const { image_id: imageId, placement_id: placementId } = identities[0]!
    await expect(
      query(
        '/* rejectUnknownRegistryMarker */ INSERT INTO media_delivery_repair_markers (delivery_key, marker_token) VALUES ($1, 1)',
        [`image-placement:${placementId}:0:${imageId}`],
      ),
    ).rejects.toMatchObject({ code: '23503' })
  })
})
