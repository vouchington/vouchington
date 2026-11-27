import { beforeAll, describe, expect, it } from 'vitest'
import { POST_MODERATION_POLICY_REVISION } from '@voucha/types/entities/post-moderation'
import { createLocalTestUser } from '../../../../test-helpers/data-stores/psql/users.mts'
import {
  completeLocalTestImagePlacementDeliveryRecord,
  insertLocalTestPost,
  queryLocalTestPostImageIds,
  queryLocalTestPostOpenAIModerationFlag,
  queryLocalTestViewPostsDefinition,
  recordLocalTestPostOpenAIModerationDisposition,
} from '../../../../test-helpers/data-stores/psql/posts.mts'
import {
  getTestPostImagePlacement,
  insertTestImage,
  insertTestPostImage,
  markImageModerationFlagged,
} from '../../../../test-helpers/index.mts'
import { stageImagePlacementDeliveryRecord } from '../../../../services/media-delivery-safety/delivery-registry-staging.mts'

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

  it('filters view_posts moderation lookup with POST_MODERATION_POLICY_REVISION', async () => {
    const definition = await queryLocalTestViewPostsDefinition()
    const matches = [
      ...definition.matchAll(
        /ROW\(\s*posts\.id,\s*posts\.llm_moderation_content_sha256,\s*'([^']+)'::text\s*\)::post_moderation_version_keys/g,
      ),
    ]
    expect(matches).toHaveLength(1)
    expect(matches[0]?.[1]).toBe(POST_MODERATION_POLICY_REVISION)
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

    await stageImagePlacementDeliveryRecord({
      placementId: placement.placement_id,
      revision: placement.placement_revision,
      imageId,
      state: 'allow',
    })
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
