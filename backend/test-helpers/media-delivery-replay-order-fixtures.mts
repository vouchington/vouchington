import { v7 } from 'uuid'
import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import {
  createTestUser,
  insertTestPost,
  insertTestImage,
  insertTestPostImage,
  getTestPostImagePlacement,
} from '@voucha/test-helpers'
import { markTestMediaDeliveryRecordFailed } from './entities/image-surface-placements.mts'
import { settleReplayFixtureOperations } from './copyright-route-replay-setup.mts'

/** Explicit canonical UUID identities: replay ordering does not depend on mint time or action jobs. */
export async function createMediaReplayOrderFixtures() {
  const prefix = v7().slice(0, -6)
  const placementIds = [`${prefix}000001`, `${prefix}000002`]
  const recordIds = [`${prefix}000004`, `${prefix}000003`]
  const [moderator, nonModerator] = await settleReplayFixtureOperations([
    createTestUser({ extraRoles: ['moderator'] }),
    createTestUser(),
  ])
  const fixtures = []
  for (const [index, placementId] of placementIds.entries()) {
    const [postId, imageId] = await settleReplayFixtureOperations([
      insertTestPost({
        title: 'Replay UUID order',
        slug: crypto.randomUUID(),
        createdById: moderator.id,
        markdown: 'Owned replay ordering fixture.',
      }),
      insertTestImage(moderator.id),
    ])
    await insertTestPostImage({ postId, imageId, placementId })
    const placement = await getTestPostImagePlacement(postId, imageId)
    if (!placement || placement.placement_id !== placementId)
      throw new Error('Replay UUID fixture binding mismatch')
    const mediaDeliveryRegistryRecordId = recordIds[index]!
    // Real canonical INSERT invokes generation, retained-binding and pending-history triggers.
    await write(sql`/* createMediaReplayOrderFixture */
      INSERT INTO media_delivery_registry_records (id, placement_id, placement_revision, image_id, desired_state)
      VALUES (${mediaDeliveryRegistryRecordId}::uuid, ${placementId}::uuid,
        ${placement.placement_revision}, ${imageId}::uuid, 'withheld')
    `)
    await markTestMediaDeliveryRecordFailed(mediaDeliveryRegistryRecordId)
    fixtures.push({
      moderator,
      nonModerator,
      postId,
      imageId,
      placementId,
      mediaDeliveryRegistryRecordId,
    })
  }
  return fixtures
}
