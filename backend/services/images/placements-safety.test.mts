import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  createTestUser,
  insertTestImage,
  insertTestPost,
  insertTestPostImage,
  markImageModerationFlagged,
  markImageQuarantinePending,
} from '@voucha/test-helpers'
import { getPostImages } from '@services/posts/images'
import {
  restoreImagePlacementForCopyright,
  withholdImagePlacementForCopyright,
} from './placements.mts'

describe('image placement copyright restore safety', () => {
  it.each([
    ['flagged by moderation', markImageModerationFlagged],
    ['pending quarantine', markImageQuarantinePending],
  ])('refuses a restore when its image is %s', async (_label, applySafetyBlocker) => {
    const creator = await createTestUser()
    const suffix = randomUUID()
    const postId = await insertTestPost({
      title: `Placement safety ${suffix}`,
      slug: `placement-safety-${suffix}`,
      createdById: creator.id,
      markdown: '',
    })
    const imageId = await insertTestImage(creator.id)
    await insertTestPostImage({ postId, imageId })
    const placement = (await getPostImages(postId))[0]!
    const placementKey = `image-placement:${placement.placement_id}`
    await withholdImagePlacementForCopyright({
      placementKey,
      expectedRevision: placement.placement_revision,
    })
    await applySafetyBlocker(imageId)

    await expect(
      restoreImagePlacementForCopyright({ placementKey, expectedRevision: 1 }),
    ).resolves.toMatchObject({
      status: 'deleted',
      placement: { revision: 1, withheld: true, safetyBlocked: true },
    })
  })
})
