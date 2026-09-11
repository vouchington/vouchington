import { randomUUID } from 'node:crypto'
import { getModeratorActionRowsForTest } from '@voucha/test-helpers/sql-state'
import { createTestUser } from '@voucha/test-helpers'
import { insertTestCommunity } from '@voucha/test-helpers/entities/communities'
import { insertTestImage, insertTestPostImage } from '@voucha/test-helpers/entities/images'
import { insertTestPost } from '@voucha/test-helpers/entities/posts'
import { getModerationSystemUserId } from '@services/users/system-users'
import { describe, expect, it } from 'vitest'
import { recordImageAutoRemoval } from '../image-auto-removal-audit.mts'

describe('recordImageAutoRemoval', () => {
  it('records community-scoped modlog entries for each affected community post image', async () => {
    const user = await createTestUser()
    const community = await insertTestCommunity({ createdById: user.id })
    const otherCommunity = await insertTestCommunity({ createdById: user.id })
    const postId = await insertTestPost({
      title: 'Post with moderated image',
      slug: `post-with-moderated-image-${randomUUID()}`,
      createdById: user.id,
      markdown: 'image post',
      communityId: community.id,
    })
    const otherPostId = await insertTestPost({
      title: 'Other post with moderated image',
      slug: `other-post-with-moderated-image-${randomUUID()}`,
      createdById: user.id,
      markdown: 'other image post',
      communityId: otherCommunity.id,
    })
    const imageId = await insertTestImage(user.id)

    await insertTestPostImage({ postId, imageId })
    await insertTestPostImage({ postId: otherPostId, imageId })

    await recordImageAutoRemoval(imageId)

    const automodUserId = await getModerationSystemUserId()
    const [action] = await getModeratorActionRowsForTest({
      actorId: automodUserId,
      postId,
    })
    expect(action).toMatchObject({
      action_type: 'remove',
      actor_id: automodUserId,
      community_id: community.id,
      post_id: postId,
      metadata: { reason: 'openai_image_moderation', imageId },
    })
    const [otherAction] = await getModeratorActionRowsForTest({
      actorId: automodUserId,
      postId: otherPostId,
    })
    expect(otherAction).toMatchObject({
      action_type: 'remove',
      actor_id: automodUserId,
      community_id: otherCommunity.id,
      post_id: otherPostId,
      metadata: { reason: 'openai_image_moderation', imageId },
    })
  })
})
