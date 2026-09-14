import { beforeAll, describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  createTestUser,
  insertPendingTestImage,
  insertTestImage,
  insertTestPost,
  insertTestPostImage,
  markImageDeleted,
} from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'
import { encodeCursor } from '@modules/pagination'
import {
  ensureCurrentPostModerationVersion,
  recordPostModerationDisposition,
} from '@services/post-clearance'

async function attachCompletedImages(
  postId: string,
  userId: string,
  count: number,
): Promise<string[]> {
  const imageIds: string[] = []
  for (let orderIndex = 0; orderIndex < count; orderIndex += 1) {
    const imageId = await insertTestImage(userId)
    await insertTestPostImage({
      postId,
      imageId,
      orderIndex,
      caption: `Image ${orderIndex}`,
    })
    imageIds.push(imageId)
  }
  return imageIds
}

describe('GET /api/v1/posts/review-queue media', () => {
  let admin: PrivateUser
  let regularUser: PrivateUser

  beforeAll(async () => {
    ;[admin, regularUser] = await Promise.all([
      createTestUser({ administrator: true }),
      createTestUser(),
    ])
  })

  it('returns provider-neutral media reveal metadata for zero and one image', async () => {
    const prefix = crypto.randomUUID().replaceAll('-', '').slice(0, 9)
    const noImageId = `ffffffff-ffff-7fff-8000-${prefix}001`
    const oneImageId = `ffffffff-ffff-7fff-8000-${prefix}002`
    const passOneImageId = `ffffffff-ffff-7fff-8000-${prefix}003`
    const afterId = `ffffffff-ffff-7fff-8000-${prefix}004`
    for (const [id, title, markdown] of [
      [noImageId, 'no-image', 'No attached image'],
      [oneImageId, 'one-image', 'One attached image'],
      [passOneImageId, 'pass-one-image', 'One attached image with a pass disposition'],
    ] as const) {
      await insertTestPost({
        id,
        title: `review-queue-${title}-${prefix}`,
        slug: `review-queue-${title}-${prefix}`,
        createdById: regularUser.id,
        markdown,
        clearanceStatus: 'rejected',
      })
    }
    const [noImageVersion, oneImageVersion, passOneImageVersion] = await Promise.all([
      ensureCurrentPostModerationVersion(noImageId),
      ensureCurrentPostModerationVersion(oneImageId),
      ensureCurrentPostModerationVersion(passOneImageId),
    ])
    await Promise.all([
      recordPostModerationDisposition({
        versionId: noImageVersion.id,
        source: 'openai_omni',
        disposition: 'review',
        reasonCode: 'provider_flagged',
      }),
      recordPostModerationDisposition({
        versionId: oneImageVersion.id,
        source: 'openai_omni',
        disposition: 'review',
        reasonCode: 'provider_flagged',
      }),
      recordPostModerationDisposition({
        versionId: passOneImageVersion.id,
        source: 'openai_omni',
        disposition: 'pass',
        reasonCode: 'provider_passed',
      }),
    ])
    const [imageId] = await attachCompletedImages(oneImageId, regularUser.id, 1)
    const [passImageId] = await attachCompletedImages(passOneImageId, regularUser.id, 1)

    const request = createRequest()
    await request.authenticateAs(admin)
    const response = await request
      .get(
        `/api/v1/posts/review-queue?limit=3&after=${encodeURIComponent(encodeCursor({ id: afterId }))}`,
      )
      .expect(200)

    const byId = new Map<
      string,
      {
        requires_reveal: boolean
        images: Array<{ image_id: string; order_index: number; caption: string }>
      }
    >(
      response.body.results.map((post: { id: string; media_reveal: unknown }) => [
        post.id,
        post.media_reveal,
      ]),
    )
    expect(byId.get(noImageId)).toEqual({ requires_reveal: false, images: [] })
    expect(byId.get(oneImageId)).toEqual({
      requires_reveal: true,
      images: [{ image_id: imageId, order_index: 0, caption: 'Image 0' }],
    })
    expect(byId.get(passOneImageId)).toEqual({
      requires_reveal: false,
      images: [{ image_id: passImageId, order_index: 0, caption: 'Image 0' }],
    })
  })

  it('caps ordered completed non-deleted media at twenty images', async () => {
    const prefix = crypto.randomUUID().replaceAll('-', '').slice(0, 9)
    const twentyImageId = `ffffffff-ffff-7fff-8000-${prefix}001`
    const overTwentyImageId = `ffffffff-ffff-7fff-8000-${prefix}002`
    const afterId = `ffffffff-ffff-7fff-8000-${prefix}003`
    for (const [id, title] of [
      [twentyImageId, 'twenty'],
      [overTwentyImageId, 'over-twenty'],
    ] as const) {
      await insertTestPost({
        id,
        title: `review-queue-${title}-${prefix}`,
        slug: `review-queue-${title}-${prefix}`,
        createdById: regularUser.id,
        markdown: `${title} attached images`,
        clearanceStatus: 'rejected',
      })
    }
    const twentyIds = await attachCompletedImages(twentyImageId, regularUser.id, 20)
    const overTwentyIds = await attachCompletedImages(overTwentyImageId, regularUser.id, 21)
    const pendingId = await insertPendingTestImage(regularUser.id)
    await insertTestPostImage({
      postId: overTwentyImageId,
      imageId: pendingId,
      orderIndex: 21,
      caption: 'Pending',
    })
    const deletedId = await insertTestImage(regularUser.id)
    await insertTestPostImage({
      postId: overTwentyImageId,
      imageId: deletedId,
      orderIndex: 22,
      caption: 'Deleted',
    })
    await markImageDeleted(deletedId)

    const request = createRequest()
    await request.authenticateAs(admin)
    const response = await request
      .get(
        `/api/v1/posts/review-queue?limit=2&after=${encodeURIComponent(encodeCursor({ id: afterId }))}`,
      )
      .expect(200)
    const byId = new Map<string, Array<{ image_id: string }>>(
      response.body.results.map(
        (post: { id: string; media_reveal: { images: Array<{ image_id: string }> } }) => [
          post.id,
          post.media_reveal.images,
        ],
      ),
    )

    expect(byId.get(twentyImageId)?.map(image => image.image_id)).toEqual(twentyIds)
    expect(byId.get(overTwentyImageId)?.map(image => image.image_id)).toEqual(
      overTwentyIds.slice(0, 20),
    )
    expect(byId.get(overTwentyImageId)).toHaveLength(20)
  })
})
