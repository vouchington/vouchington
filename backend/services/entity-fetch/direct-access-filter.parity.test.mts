import { describe, expect, it } from 'vitest'
import type { PrivateUser } from '@services/users/types'
import {
  createTestUser,
  insertEntityRelation,
  insertTestCommunity,
  insertTestCommunityMember,
  insertTestCommunityPostReview,
  insertTestLocalFollow,
  insertTestPost,
} from '@voucha/test-helpers'
import { canViewPostsBatch } from '@services/posts/check-privacy-access-batch'
import { getPostsByAnyBatch } from '@services/posts/get-batch'
import type { Post } from '@services/posts/types'
import { getUserPostsCollection } from './profile-collections.mts'

interface AccessCase {
  name: string
  candidate: Post
}

describe('direct post collection access parity', () => {
  it('matches batch authorization across persisted audience and community rules', async () => {
    const collector = await requiredUser()
    const creator = await requiredUser()
    const stranger = await requiredUser()
    const follower = await requiredUser()
    const mutual = await requiredUser()
    const communityMember = await requiredUser()
    const moderator = await requiredUser({ extraRoles: ['moderator'] })
    await insertTestLocalFollow(follower.id, creator.id)
    await insertTestLocalFollow(mutual.id, creator.id)
    await insertTestLocalFollow(creator.id, mutual.id)

    const publicId = await insertPost(creator, 'public')
    const pendingId = await insertPost(creator, 'pending', { clearanceStatus: 'pending' })
    const usersId = await insertPost(creator, 'users', {
      privacy: 'private',
      broadcast: 'users',
    })
    const followersId = await insertPost(creator, 'followers', {
      privacy: 'private',
      broadcast: 'followers',
    })
    const mutualId = await insertPost(creator, 'mutual', {
      privacy: 'private',
      broadcast: 'mutual_followers',
    })

    const community = await insertTestCommunity({
      createdById: creator.id,
      visibility: 'private',
    })
    await insertTestCommunityMember({ communityId: community.id, userId: creator.id })
    await insertTestCommunityMember({ communityId: community.id, userId: communityMember.id })
    const communityId = await insertPost(creator, 'community', {
      privacy: 'private',
      broadcast: 'users',
      communityId: community.id,
    })
    await insertTestCommunityPostReview({
      communityId: community.id,
      postId: communityId,
      submittedById: creator.id,
    })
    const commentId = await insertPost(creator, 'follower-comment', {
      postType: 'comment',
      rootId: followersId,
      parentId: followersId,
    })
    const pendingCommentId = await insertPost(creator, 'pending-follower-comment', {
      postType: 'comment',
      rootId: followersId,
      parentId: followersId,
      clearanceStatus: 'pending',
    })

    const candidates = await requiredPosts([
      publicId,
      pendingId,
      usersId,
      followersId,
      mutualId,
      communityId,
      commentId,
      pendingCommentId,
    ])
    const cases: AccessCase[] = [
      accessCase('public', publicId, candidates),
      accessCase('pending', pendingId, candidates),
      accessCase('users', usersId, candidates),
      accessCase('followers', followersId, candidates),
      accessCase('mutual', mutualId, candidates),
      accessCase('community', communityId, candidates),
      accessCase('follower-comment', commentId, candidates),
      accessCase('pending-follower-comment', pendingCommentId, candidates),
    ]
    await Promise.all(
      cases.map(({ candidate }) =>
        insertEntityRelation('relation__user__save__post', collector.id, candidate.id),
      ),
    )

    const viewers: Array<{
      viewer: PrivateUser | null
      expected: string[]
    }> = [
      { viewer: null, expected: ['public'] },
      { viewer: creator, expected: cases.map(access => access.name) },
      { viewer: stranger, expected: ['public', 'users'] },
      { viewer: follower, expected: ['public', 'users', 'followers', 'follower-comment'] },
      {
        viewer: mutual,
        expected: ['public', 'users', 'followers', 'mutual', 'follower-comment'],
      },
      { viewer: communityMember, expected: ['public', 'users', 'community'] },
      { viewer: moderator, expected: cases.map(access => access.name) },
    ]

    for (const { viewer, expected } of viewers) {
      const batchAccess = await canViewPostsBatch(
        viewer,
        cases.map(access => access.candidate),
      )
      const collection = await getUserPostsCollection(viewer, collector.id, 'saved')
      const collectionIds = new Set(collection.results.map(post => post.id))
      const batchVisible = cases
        .filter(access => batchAccess.get(access.candidate.id))
        .map(access => access.name)
      const collectionVisible = cases
        .filter(access => collectionIds.has(access.candidate.id))
        .map(access => access.name)

      expect(batchVisible).toEqual(expected)
      expect(collectionVisible).toEqual(batchVisible)
    }
  })
})

async function requiredUser(
  options: Parameters<typeof createTestUser>[0] = {},
): Promise<PrivateUser> {
  const user = await createTestUser(options)
  if (!user) throw new Error('Failed to create test user')
  return user
}

async function insertPost(
  creator: PrivateUser,
  label: string,
  overrides: Partial<Parameters<typeof insertTestPost>[0]> = {},
): Promise<string> {
  return insertTestPost({
    title: `${label} ${creator.id}`,
    slug: `${label}-${creator.id}`,
    markdown: label,
    createdById: creator.id,
    ...overrides,
  })
}

async function requiredPosts(ids: string[]): Promise<Map<string, Post>> {
  const posts = await getPostsByAnyBatch(ids)
  if (posts.some(post => !post)) throw new Error('Failed to load test posts')
  return new Map(posts.map(post => [post!.id, post!]))
}

function accessCase(name: string, candidateId: string, candidates: Map<string, Post>): AccessCase {
  const candidate = candidates.get(candidateId)
  if (!candidate) throw new Error(`Missing candidate for ${name}`)
  return { name, candidate }
}
