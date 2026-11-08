import { describe, expect, it } from 'vitest'
import { beginTransaction, createTestUserDirect, insertTestImage } from '@voucha/test-helpers'
import { insertTestPost } from '@voucha/test-helpers/entities/posts'
import { insertTestPostImage } from '@voucha/test-helpers/entities/images-post-placements'
import {
  isTestMediaDeliveryKeyLocked,
  isTestMediaPlacementRowLocked,
} from '@voucha/test-helpers/media-delivery-lock-probes'
import { createTestDeliverySurface } from '@voucha/test-helpers/media-delivery-surface'
import { lockImageDeliveryMutation } from './delivery-lock.mts'

describe('image delivery mutation lock scopes', () => {
  it('locks the union of post, image, and exact placement matches across both families', async () => {
    const user = await createTestUserDirect()
    const postIds = await Promise.all(
      Array.from({ length: 3 }, () =>
        insertTestPost({
          title: 'Delivery lock scope',
          slug: crypto.randomUUID(),
          createdById: user.id,
          markdown: 'Owned test placement',
        }),
      ),
    )
    const imageIds = await Promise.all(Array.from({ length: 3 }, () => insertTestImage(user.id)))
    const postPlacementIds = await Promise.all(
      postIds.map((postId, index) => insertTestPostImage({ postId, imageId: imageIds[index]! })),
    )
    const surface = await createTestDeliverySurface()
    {
      await using transaction = await beginTransaction()
      await lockImageDeliveryMutation(transaction, {
        postIds: [postIds[0]!],
        imageIds: [surface.tuple.imageId],
        placementIds: [postPlacementIds[0]!, postPlacementIds[1]!],
        placementOnly: true,
      })
      const matched = await Promise.all(
        [postPlacementIds[0]!, postPlacementIds[1]!, surface.tuple.placementId].map(
          isTestMediaPlacementRowLocked,
        ),
      )
      expect(matched).toEqual([true, true, true])
      expect(await isTestMediaPlacementRowLocked(postPlacementIds[2]!)).toBe(false)
      expect(await isTestMediaDeliveryKeyLocked(`media-delivery:image:${imageIds[0]}`)).toBe(false)
      expect(await isTestMediaDeliveryKeyLocked(`media-delivery:image:${imageIds[1]}`)).toBe(false)
      expect(await isTestMediaDeliveryKeyLocked(`image-placement:${postPlacementIds[1]}`)).toBe(
        true,
      )
    }
    await using expanded = await beginTransaction()
    await lockImageDeliveryMutation(expanded, { placementIds: [postPlacementIds[1]!] })
    expect(await isTestMediaDeliveryKeyLocked(`media-delivery:post:${postIds[1]}`)).toBe(true)
    expect(await isTestMediaDeliveryKeyLocked(`media-delivery:image:${imageIds[1]}`)).toBe(true)
  })
})
