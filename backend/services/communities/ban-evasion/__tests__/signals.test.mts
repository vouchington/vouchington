import { describe, it, expect, beforeAll } from 'vitest'
import {
  createTestUser,
  createRandomString,
  insertTestCommunity,
  insertTestCommunityMember,
  insertTestCommunityBan,
  insertTestPost,
  addDummyEmbeddingToPost,
  makeNearbyEmbedding,
  setTestPostContentSha,
} from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'
import type { Community } from '@services/communities/types'
import {
  checkContentHashMatchToBannedPosts,
  checkEmbeddingSimilarityToBannedPosts,
} from '../signals.mts'

// A normalized sine-wave unit vector in 1024 dimensions
const rawV = Array.from({ length: 1024 }, (_, i) => Math.sin(i * 0.1) * 0.5)
const rawMag = Math.sqrt(rawV.reduce((acc, x) => acc + x * x, 0))
const unitVector = rawV.map(x => x / rawMag)

describe('checkEmbeddingSimilarityToBannedPosts', () => {
  let owner: PrivateUser
  let community: Community

  beforeAll(async () => {
    owner = await createTestUser()
    community = await insertTestCommunity({ createdById: owner.id, visibility: 'public' })
    await insertTestCommunityMember({ communityId: community.id, userId: owner.id, role: 'owner' })
  })

  it('returns matched=false when candidate has no posts with embeddings', async () => {
    const bannedUser = await createTestUser()
    const member = await createTestUser()

    await Promise.all([
      insertTestCommunityMember({ communityId: community.id, userId: bannedUser.id }),
      insertTestCommunityMember({ communityId: community.id, userId: member.id }),
    ])
    await insertTestCommunityBan({
      communityId: community.id,
      userId: bannedUser.id,
      bannedById: owner.id,
    })

    const result = await checkEmbeddingSimilarityToBannedPosts(community.id, member.id)

    expect(result.matched).toBe(false)
    expect(result.score).toBe(0)
  })

  it('returns matched=true with score >= 0.95 for nearby post embeddings', async () => {
    const bannedUser = await createTestUser()
    const member = await createTestUser()
    const random = createRandomString(8)

    await Promise.all([
      insertTestCommunityMember({ communityId: community.id, userId: bannedUser.id }),
      insertTestCommunityMember({ communityId: community.id, userId: member.id }),
    ])

    const [bannedPostId, memberPostId] = await Promise.all([
      insertTestPost({
        title: `Banned embedding post ${random}`,
        slug: `banned-embed-${random}`,
        markdown: 'Embedded banned content',
        createdById: bannedUser.id,
        communityId: community.id,
        postType: 'article',
      }),
      insertTestPost({
        title: `Member embedding post ${random}`,
        slug: `member-embed-${random}`,
        markdown: 'Embedded member content',
        createdById: member.id,
        communityId: community.id,
        postType: 'article',
      }),
    ])

    // Give each post a nearby vector so cosine similarity stays high
    await Promise.all([
      addDummyEmbeddingToPost(bannedPostId, { embedding: makeNearbyEmbedding(unitVector, 0.01) }),
      addDummyEmbeddingToPost(memberPostId, { embedding: makeNearbyEmbedding(unitVector, 0.01) }),
    ])

    await insertTestCommunityBan({
      communityId: community.id,
      userId: bannedUser.id,
      bannedById: owner.id,
    })

    const result = await checkEmbeddingSimilarityToBannedPosts(
      community.id,
      member.id,
      memberPostId,
    )

    expect(result.matched).toBe(true)
    expect(result.score).toBeGreaterThanOrEqual(0.95)
    expect(result.sourceUserId).toBe(bannedUser.id)
  })
})

describe('checkContentHashMatchToBannedPosts', () => {
  it('only compares the triggering candidate post when its id is provided', async () => {
    const owner = await createTestUser()
    const bannedUser = await createTestUser()
    const candidate = await createTestUser()
    const community = await insertTestCommunity({ createdById: owner.id, visibility: 'public' })
    await Promise.all([
      insertTestCommunityMember({ communityId: community.id, userId: owner.id, role: 'owner' }),
      insertTestCommunityMember({ communityId: community.id, userId: bannedUser.id }),
      insertTestCommunityMember({ communityId: community.id, userId: candidate.id }),
    ])
    const suffix = createRandomString(8)
    const [bannedPostId, matchingCandidatePostId, triggeringPostId] = await Promise.all([
      insertTestPost({
        title: `Scoped banned post ${suffix}`,
        slug: `scoped-banned-${suffix}`,
        markdown: 'Matching content',
        createdById: bannedUser.id,
        communityId: community.id,
        postType: 'article',
      }),
      insertTestPost({
        title: `Scoped old candidate post ${suffix}`,
        slug: `scoped-old-candidate-${suffix}`,
        markdown: 'Matching content',
        createdById: candidate.id,
        communityId: community.id,
        postType: 'article',
      }),
      insertTestPost({
        title: `Scoped triggering post ${suffix}`,
        slug: `scoped-trigger-${suffix}`,
        markdown: 'Different content',
        createdById: candidate.id,
        communityId: community.id,
        postType: 'article',
      }),
    ])
    await Promise.all([
      setTestPostContentSha([bannedPostId, matchingCandidatePostId], Buffer.from('d'.repeat(32))),
      setTestPostContentSha([triggeringPostId], Buffer.from('e'.repeat(32))),
      insertTestCommunityBan({
        communityId: community.id,
        userId: bannedUser.id,
        bannedById: owner.id,
      }),
    ])

    await expect(
      checkContentHashMatchToBannedPosts(community.id, candidate.id, triggeringPostId),
    ).resolves.toEqual({ matched: false, score: 0 })
    await expect(
      checkContentHashMatchToBannedPosts(community.id, candidate.id, matchingCandidatePostId),
    ).resolves.toMatchObject({ matched: true, sourceUserId: bannedUser.id })
  })
})
