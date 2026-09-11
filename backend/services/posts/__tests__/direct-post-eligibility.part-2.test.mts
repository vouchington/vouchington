import { describe, expect, it } from 'vitest'

import {
  archiveTestCommunity,
  createTestUser,
  deleteTestPost,
  insertTestCommunity,
  insertTestCommunityPostReview,
  insertTestLocalFollow,
  insertTestPost,
} from '@voucha/test-helpers'
import { canViewPost } from '../check-privacy-access.mts'
import { getPostByAny } from '../get.mts'

describe('canViewPost — audience and deletion', () => {
  it('keeps follower, author, and administrator access distinct from unrelated viewers', async () => {
    const suffix = Math.random().toString(36).slice(2, 10)
    const author = await createTestUser({ username: `direct-audience-author-${suffix}` })
    const follower = await createTestUser({ username: `direct-audience-follower-${suffix}` })
    const stranger = await createTestUser({ username: `direct-audience-stranger-${suffix}` })
    const administrator = await createTestUser({
      username: `direct-audience-admin-${suffix}`,
      administrator: true,
    })
    if (!author || !follower || !stranger || !administrator)
      throw new Error('Failed to create test users')
    const postId = await insertTestPost({
      createdById: author.id,
      title: `followers post ${suffix}`,
      slug: `followers-post-${suffix}`,
      markdown: 'private',
      privacy: 'private',
      broadcast: 'followers',
    })
    await insertTestLocalFollow(follower.id, author.id)
    const post = await getPostByAny(postId)
    if (!post) throw new Error('Failed to load test post')

    await expect(canViewPost(author, post)).resolves.toBe(true)
    await expect(canViewPost(follower, post)).resolves.toBe(true)
    await expect(canViewPost(stranger, post)).resolves.toBe(false)
    await expect(canViewPost(administrator, post)).resolves.toBe(true)

    await deleteTestPost(postId)
    await expect(canViewPost(author, post)).resolves.toBe(false)
    await expect(canViewPost(administrator, post)).resolves.toBe(false)
  })

  it('keeps approved posts in archived public communities directly readable', async () => {
    const suffix = Math.random().toString(36).slice(2, 10)
    const author = await createTestUser({ username: `direct-archived-community-${suffix}` })
    if (!author) throw new Error('Failed to create test author')
    const community = await insertTestCommunity({ createdById: author.id })
    const postId = await insertTestPost({
      communityId: community.id,
      createdById: author.id,
      markdown: 'archived community content',
      slug: `direct-archived-community-${suffix}`,
      title: `Archived community ${suffix}`,
    })
    await insertTestCommunityPostReview({
      communityId: community.id,
      postId,
      submittedById: author.id,
    })
    await archiveTestCommunity({ communityId: community.id, archivedById: author.id })
    const post = await getPostByAny(postId)
    if (!post) throw new Error('Failed to load test post')

    await expect(canViewPost(null, post)).resolves.toBe(true)
  })
})
