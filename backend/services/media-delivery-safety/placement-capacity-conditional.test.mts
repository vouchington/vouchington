import { describe, expect, it, onTestFinished } from 'vitest'
import {
  createTestUser,
  insertTestImage,
  insertTestPost,
  insertTestPostImage,
} from '@voucha/test-helpers'
import {
  conflictTestImageCapacityRelease,
  conflictTestImagePolicyWrite,
  readTestImageCapacityPolicy,
} from '@voucha/test-helpers/image-capacity-conditional-writes'
import { readTestImageCapacitySlots } from '@voucha/test-helpers/image-placement-capacity'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { mediaDeliverySafetyWorkConfig } from './work-limits.mts'

async function fixture() {
  const user = await createTestUser()
  const imageId = await insertTestImage(user.id)
  const postId = await insertTestPost({
    title: 'Conditional capacity',
    slug: crypto.randomUUID(),
    markdown: 'Owned image',
    createdById: user.id,
  })
  const placementId = await insertTestPostImage({ postId, imageId })
  return { user, imageId, placementId }
}

describe('conditional image capacity writes', () => {
  it('rejects a stale slot deletion and rolls back the other release in the same transaction', async () => {
    const { user, imageId, placementId } = await fixture()
    const secondPostId = await insertTestPost({
      title: 'Second capacity',
      slug: crypto.randomUUID(),
      markdown: 'Owned image',
      createdById: user.id,
    })
    const secondPlacementId = await insertTestPostImage({ postId: secondPostId, imageId })
    expect(await conflictTestImageCapacityRelease([placementId, secondPlacementId])).toMatchObject({
      status: 409,
      code: 'IMAGE_PLACEMENT_LIMIT_REACHED',
    })
    expect(await readTestImageCapacitySlots(imageId)).toEqual([2, 3])
  })

  it('rejects a stale placement policy write and rolls its image and reservation changes back', async () => {
    onTestFinished(
      overrideDynamicConfigFieldsForTest(mediaDeliverySafetyWorkConfig, {
        policy_mutation_attempts: 1,
      }),
    )
    const { imageId, placementId } = await fixture()
    expect(await conflictTestImagePolicyWrite(imageId, placementId)).toMatchObject({
      status: 409,
      code: 'IMAGE_PLACEMENT_LIMIT_REACHED',
    })
    expect(await readTestImageCapacityPolicy(imageId, placementId)).toEqual({
      image_policy: true,
      reservation_policy: true,
      placement_policy: true,
    })
  })
})
