import { describe, it, expect, beforeAll } from 'vitest'
import { randomBytes, randomUUID } from 'node:crypto'
import {
  addDummyEmbeddingToPost,
  createTestUser,
  createRandomString,
  getPostEmbeddingData,
  insertTestCommunity,
  insertTestCommunityMember,
  insertTestPost,
  setPostEmbeddingContentSha256KeepingInput,
  setPostEmbeddingContentSha256,
} from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'
import type { Community } from '@services/communities/types'
import {
  enqueueBanEvasionDetectionForEmbeddedFirstCommunityPosts,
  isFirstCommunityPost,
} from '../get.mts'
import { ban_evasion } from '@queues/ban-evasion/queues'

describe('isFirstCommunityPost', () => {
  let owner: PrivateUser
  let community: Community

  beforeAll(async () => {
    owner = await createTestUser()
    community = await insertTestCommunity({ createdById: owner.id, visibility: 'public' })
    await insertTestCommunityMember({ communityId: community.id, userId: owner.id, role: 'owner' })
  })

  it('returns true when the given post is the earliest post by the user in the community', async () => {
    const member = await createTestUser()
    const random = createRandomString(8)
    await insertTestCommunityMember({ communityId: community.id, userId: member.id })

    const postId = await insertTestPost({
      title: `First community post ${random}`,
      slug: `first-community-post-${random}`,
      markdown: 'Content',
      createdById: member.id,
      communityId: community.id,
      postType: 'article',
    })

    expect(await isFirstCommunityPost(community.id, member.id, postId)).toBe(true)
  })

  it('returns false when the given post is not the earliest post by the user', async () => {
    const member = await createTestUser()
    const random = createRandomString(8)
    await insertTestCommunityMember({ communityId: community.id, userId: member.id })

    const firstPostId = await insertTestPost({
      title: `First post ${random}`,
      slug: `first-post-${random}`,
      markdown: 'Content',
      createdById: member.id,
      communityId: community.id,
      postType: 'article',
    })
    const secondPostId = await insertTestPost({
      title: `Second post ${random}`,
      slug: `second-post-${random}`,
      markdown: 'Content',
      createdById: member.id,
      communityId: community.id,
      postType: 'article',
    })

    expect(await isFirstCommunityPost(community.id, member.id, firstPostId)).toBe(true)
    expect(await isFirstCommunityPost(community.id, member.id, secondPostId)).toBe(false)
  })

  it('enqueues detection for an embedded first community post', async () => {
    const member = await createTestUser()
    const random = createRandomString(8)
    await insertTestCommunityMember({ communityId: community.id, userId: member.id })
    const postId = await insertTestPost({
      title: `Embedded first post ${random}`,
      slug: `embedded-first-post-${random}`,
      markdown: 'Content',
      createdById: member.id,
      communityId: community.id,
      postType: 'article',
    })
    const contentSha256 = await addCurrentDummyEmbeddingToPost(postId)

    await enqueueBanEvasionDetectionForEmbeddedFirstCommunityPosts([postId])

    await expect(getPostEmbeddingData(postId)).resolves.toMatchObject({
      ban_evasion_post_embedding_input_sha: contentSha256,
    })
  })

  it('enqueues detection when the embedded first post is after the first chunk', async () => {
    const member = await createTestUser()
    const random = createRandomString(8)
    await insertTestCommunityMember({ communityId: community.id, userId: member.id })
    const postId = await insertTestPost({
      title: `Embedded chunked first post ${random}`,
      slug: `embedded-chunked-first-post-${random}`,
      markdown: 'Content',
      createdById: member.id,
      communityId: community.id,
      postType: 'article',
    })
    const contentSha256 = await addCurrentDummyEmbeddingToPost(postId)

    await enqueueBanEvasionDetectionForEmbeddedFirstCommunityPosts([
      ...Array.from({ length: 1000 }, () => randomUUID()),
      postId,
    ])

    await expect(getPostEmbeddingData(postId)).resolves.toMatchObject({
      ban_evasion_post_embedding_input_sha: contentSha256,
    })
  })

  it('skips posts without embeddings', async () => {
    const member = await createTestUser()
    const random = createRandomString(8)
    await insertTestCommunityMember({ communityId: community.id, userId: member.id })
    const postId = await insertTestPost({
      title: `Unembedded first post ${random}`,
      slug: `unembedded-first-post-${random}`,
      markdown: 'Content',
      createdById: member.id,
      communityId: community.id,
      postType: 'article',
    })

    await enqueueBanEvasionDetectionForEmbeddedFirstCommunityPosts([postId])

    await expect(getBanEvasionJobsFor(community.id, member.id)).resolves.toHaveLength(0)
  })

  it('skips posts whose embedding input sha does not match current content sha', async () => {
    const member = await createTestUser()
    const random = createRandomString(8)
    await insertTestCommunityMember({ communityId: community.id, userId: member.id })
    const postId = await insertTestPost({
      title: `Stale embedded first post ${random}`,
      slug: `stale-embedded-first-post-${random}`,
      markdown: 'Content',
      createdById: member.id,
      communityId: community.id,
      postType: 'article',
    })
    await addCurrentDummyEmbeddingToPost(postId)
    await setPostEmbeddingContentSha256KeepingInput(postId, randomBytes(32))

    await enqueueBanEvasionDetectionForEmbeddedFirstCommunityPosts([postId])

    await expect(getBanEvasionJobsFor(community.id, member.id)).resolves.toHaveLength(0)
  })

  it('skips embedded posts that are not the first community post', async () => {
    const member = await createTestUser()
    const random = createRandomString(8)
    await insertTestCommunityMember({ communityId: community.id, userId: member.id })
    await insertTestPost({
      title: `Earlier post ${random}`,
      slug: `embedded-later-earlier-${random}`,
      markdown: 'Content',
      createdById: member.id,
      communityId: community.id,
      postType: 'article',
    })
    const secondPostId = await insertTestPost({
      title: `Later embedded post ${random}`,
      slug: `embedded-later-post-${random}`,
      markdown: 'Content',
      createdById: member.id,
      communityId: community.id,
      postType: 'article',
    })
    await addCurrentDummyEmbeddingToPost(secondPostId)

    await enqueueBanEvasionDetectionForEmbeddedFirstCommunityPosts([secondPostId])

    await expect(getBanEvasionJobsFor(community.id, member.id)).resolves.toHaveLength(0)
  })
})

async function getBanEvasionJobsFor(communityId: string, userId: string) {
  const waiting = await ban_evasion.getJobs('waiting')
  return waiting.filter(job => {
    const data = job.data as { communityId?: string; userId?: string }
    return data.communityId === communityId && data.userId === userId
  })
}

async function addCurrentDummyEmbeddingToPost(postId: string) {
  const contentSha256 = randomBytes(32)
  await addDummyEmbeddingToPost(postId)
  await setPostEmbeddingContentSha256(postId, contentSha256)
  return contentSha256
}
