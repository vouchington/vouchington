import { describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  createTestUser,
  getTestPostDeletedAt,
  setTestPostClearanceStatus,
} from '@voucha/test-helpers'
import {
  insertTestCommunity,
  insertTestCommunityMember,
} from '@voucha/test-helpers/entities/communities'
import { createCommunityPostFixture } from '@services/posts/test-support'

describe('DELETE /api/v1/posts/:idOrSlug community moderation', () => {
  it('allows a community moderator to delete another author pending comment', async () => {
    const moderator = await createTestUser()
    const author = await createTestUser()
    const community = await insertTestCommunity({ createdById: moderator.id })
    await insertTestCommunityMember({
      communityId: community.id,
      userId: moderator.id,
      role: 'moderator',
    })
    await insertTestCommunityMember({ communityId: community.id, userId: author.id })
    const rootPost = await createCommunityPostFixture(author, community.id)
    const comment = await createCommunityPostFixture(author, community.id, {
      post_type: 'comment',
      parent_id: rootPost.id,
    })
    await setTestPostClearanceStatus(comment.id, 'pending', author.id)

    const request = createRequest()
    await request.authenticateAs(moderator)
    await request.delete(`/api/v1/posts/${comment.id}`).expect(204)

    await expect(getTestPostDeletedAt(comment.id)).resolves.not.toBeNull()
  })
})
