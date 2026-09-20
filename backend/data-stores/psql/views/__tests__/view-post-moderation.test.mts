import { beforeAll, describe, expect, it } from 'vitest'
import { createLocalTestUser } from '../../../../test-helpers/data-stores/psql/users.mts'
import {
  completeLocalTestImagePlacementDeliveryRecord,
  insertLocalTestPost,
  queryLocalTestPostImageIds,
  queryLocalTestPostOpenAIModerationFlag,
  recordLocalTestPostOpenAIModerationDisposition,
} from '../../../../test-helpers/data-stores/psql/posts.mts'
import {
  getTestPostImagePlacement,
  insertTestImage,
  insertTestPostImage,
  markImageModerationFlagged,
} from '../../../../test-helpers/index.mts'
import { stagePostImagePlacementDeliveryRecords } from '../../../../services/images/delivery-registry.mts'

describe('view_posts moderation projection', () => {
  let postId: string

  beforeAll(async () => {
    const user = await createLocalTestUser()
    postId = await insertLocalTestPost({
      title: `view-post-moderation-${crypto.randomUUID()}`,
      createdById: user.id,
      markdown: 'post moderation projection test',
    })
  })

  it('projects the latest OpenAI disposition for the current content version', async () => {
    expect(await queryLocalTestPostOpenAIModerationFlag(postId)).toBeNull()

    await recordLocalTestPostOpenAIModerationDisposition(postId, 'review')
    expect(await queryLocalTestPostOpenAIModerationFlag(postId)).toBe(true)

    await recordLocalTestPostOpenAIModerationDisposition(postId, 'pass')
    expect(await queryLocalTestPostOpenAIModerationFlag(postId)).toBe(false)
  })

  it('projects post images only after their exact delivery tuple completes while image safety passes', async () => {
    const user = await createLocalTestUser()
    const imagePostId = await insertLocalTestPost({
      title: `view-post-image-delivery-${crypto.randomUUID()}`,
      createdById: user.id,
      markdown: 'post image delivery projection test',
    })
    const imageId = await insertTestImage(user.id)
    await insertTestPostImage({ postId: imagePostId, imageId })
    const placement = await getTestPostImagePlacement(imagePostId, imageId)
    if (!placement) throw new Error('post image placement was not created')

    await stagePostImagePlacementDeliveryRecords(imagePostId)
    expect(await queryLocalTestPostImageIds(imagePostId)).toEqual([])

    await completeLocalTestImagePlacementDeliveryRecord({
      placementId: placement.placement_id,
      revision: placement.placement_revision,
      imageId,
    })
    expect(await queryLocalTestPostImageIds(imagePostId)).toEqual([imageId])

    await markImageModerationFlagged(imageId)
    expect(await queryLocalTestPostImageIds(imagePostId)).toEqual([])
  })
})
