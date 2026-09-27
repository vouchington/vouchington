import { afterAll, describe, expect, it } from 'vitest'
import { insertTestImage } from '../../../test-helpers/entities/images-insert.mts'
import { createTestUser } from '../../../test-helpers/entities/users.mts'
import { beginTransaction, onGracefulShutdown } from '../index.mts'

describe('retained media binding behavior', () => {
  afterAll(onGracefulShutdown)

  it('rejects a surface child for a post-family binding', async () => {
    const user = await createTestUser()
    const imageId = await insertTestImage(user.id)
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
    await expect(
      query(
        "/* rejectWrongFamilyChild */ INSERT INTO image_surface_placements (placement_id, surface_kind, image_id, user_id) VALUES ($1, 'user-profile-image', $2, $3)",
        [placementId, imageId, user.id],
      ),
    ).rejects.toMatchObject({ code: '23503' })
  })

  it('rejects a registry image other than the retained placement image', async () => {
    const user = await createTestUser()
    const imageId = await insertTestImage(user.id)
    const wrongImageId = await insertTestImage(user.id)
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
    await expect(
      query(
        "/* rejectWrongRegistryPair */ INSERT INTO media_delivery_registry_records (delivery_key, placement_id, placement_revision, image_id, desired_state) VALUES ($1, $2, 0, $3, 'withheld')",
        [`image-placement:${placementId}:0:${wrongImageId}`, placementId, wrongImageId],
      ),
    ).rejects.toMatchObject({ code: '23503' })
  })
})
