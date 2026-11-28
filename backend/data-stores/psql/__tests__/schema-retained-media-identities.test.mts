import { onGracefulShutdown } from '@data-stores/graceful-shutdown'
import { afterAll, describe, expect, it } from 'vitest'
import {
  readPartitionChildNames,
  readPublicNonInternalTriggers,
} from '../../../test-helpers/data-stores/psql/schema-catalog.mts'
import {
  insertUnknownRegistryMarker,
  mutateReservedRetainedBinding,
  readRegistryBackedMarkerKeys,
  readRetainedMediaFamilyChecks,
  readRetainedMediaForeignKeys,
} from '../../../test-helpers/data-stores/psql/schema-retained-media.mts'

describe('concrete retained media identities', () => {
  afterAll(() => onGracefulShutdown('SIGTERM'))

  it('declares partitioned image and immutable placement binding owners', async () => {
    const partitions = await readPartitionChildNames([
      'retained_image_identities',
      'retained_image_placement_bindings',
    ])
    expect(partitions).toEqual(
      expect.arrayContaining([
        { parent: 'retained_image_identities', child: 'retained_image_identities_default' },
        {
          parent: 'retained_image_placement_bindings',
          child: 'retained_image_placement_bindings_default',
        },
      ]),
    )
    const triggers = await readPublicNonInternalTriggers(['retained_image_placement_bindings'])
    expect(triggers).toContainEqual(
      expect.objectContaining({
        trigger_name: 'trigger_guard_retained_image_placement_binding',
      }),
    )
  })

  it('constrains live children and registry to the exact retained pair', async () => {
    const rows = await readRetainedMediaForeignKeys()
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
    const familyChecks = await readRetainedMediaFamilyChecks()
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
    const markerKeys = await readRegistryBackedMarkerKeys()
    expect(markerKeys).toEqual([
      expect.objectContaining({
        definition: expect.stringContaining(
          'FOREIGN KEY (media_delivery_registry_record_id) REFERENCES media_delivery_registry_records(id)',
        ),
      }),
    ])
  })

  it.each(['placement_id', 'image_id', 'binding_family'] as const)(
    'rejects mutation of reserved binding %s',
    async field => {
      await expect(mutateReservedRetainedBinding(field)).rejects.toMatchObject({ code: '23514' })
    },
  )

  it('rejects a repair marker without a committed registry parent', async () => {
    await expect(insertUnknownRegistryMarker()).rejects.toMatchObject({ code: '23503' })
  })
})
