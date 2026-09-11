import { describe, expect, it } from 'vitest'
import {
  getPostSemanticFixtureIterativeScanSetting,
  queryPostSemanticFixturesScopedToIds,
} from '@voucha/test-helpers/entities/posts-semantic'
import type { QueryInput } from '@data-stores/psql/types'
import { queryPostsSemantic, toolsSearchPostsSemantic } from '../semantic.mts'
import {
  addDummyEmbeddingToPost,
  createTestPost,
  createTestUser,
  makeNearbyEmbedding,
  makeRandomEmbedding,
} from '@voucha/test-helpers'

describe('queryPostSemanticFixturesFromPrimary', () => {
  it('applies the shared iterative-scan setting, matching production', async () => {
    expect(await getPostSemanticFixtureIterativeScanSetting()).toBe('strict_order')
  })
})

describe('toolsSearchPostsSemantic publication eligibility', () => {
  it.each([
    { currentUserId: undefined, audienceClause: "root_post.broadcast = 'everyone'" },
    {
      currentUserId: '00000000-0000-0000-0000-000000000001',
      audienceClause: 'publication_follow.subject_id',
    },
  ])('composes discovery eligibility for $currentUserId', async options => {
    let capturedInput: QueryInput | undefined
    const queryPosts: typeof queryPostsSemantic = async input => {
      capturedInput = input
      return { command: 'SELECT', fields: [], oid: 0, rowCount: 0, rows: [] }
    }

    await toolsSearchPostsSemantic(
      { currentUserId: options.currentUserId, query: 'rewards' },
      {
        getCachedSearchEmbedding: async () => Array<number>(1024).fill(0),
        queryPosts,
      },
    )

    expect(capturedInput).toBeDefined()
    expect(typeof capturedInput === 'string' ? capturedInput : capturedInput!.text).toContain(
      'posts.archived_at IS NULL',
    )
    expect(typeof capturedInput === 'string' ? capturedInput : capturedInput!.text).toContain(
      'publication_suspension.lifted_at IS NULL',
    )
    expect(typeof capturedInput === 'string' ? capturedInput : capturedInput!.text).toContain(
      options.audienceClause,
    )
  })

  it('defaults and clamps limits while filtering post types', { timeout: 30_000 }, async () => {
    const queryEmbedding = makeRandomEmbedding()
    const user = await createTestUser()
    const reviewCount = 6
    const discussionCount = 6
    const fixturePostIds: string[] = []

    for (const index of Array.from({ length: reviewCount }, (_, value) => value)) {
      const post = await createTestPost({
        user,
        title: `Semantic review ${crypto.randomUUID()} ${index}`,
        markdown: 'Semantic review fixture content.',
        post_type: 'review',
      })
      await addDummyEmbeddingToPost(post.id, { embedding: makeNearbyEmbedding(queryEmbedding) })
      fixturePostIds.push(post.id)
    }

    for (const index of Array.from({ length: discussionCount }, (_, value) => value)) {
      const post = await createTestPost({
        user,
        title: `Semantic discussion ${crypto.randomUUID()} ${index}`,
        markdown: 'Semantic discussion fixture content.',
        post_type: 'discussion',
      })
      await addDummyEmbeddingToPost(post.id, { embedding: makeNearbyEmbedding(queryEmbedding) })
      fixturePostIds.push(post.id)
    }

    const dependencies = {
      getCachedSearchEmbedding: async () => queryEmbedding,
      queryPosts: queryPostSemanticFixturesScopedToIds(fixturePostIds),
    }
    const options = { currentUserId: user.id, query: `semantic post search ${crypto.randomUUID()}` }

    expect(await toolsSearchPostsSemantic(options, dependencies)).toHaveLength(5)
    expect(await toolsSearchPostsSemantic({ ...options, limit: 100 }, dependencies)).toHaveLength(
      10,
    )

    const reviews = await toolsSearchPostsSemantic(
      { ...options, limit: 100, postType: 'review' },
      dependencies,
    )
    expect(reviews).toHaveLength(reviewCount)
    expect(reviews.every(result => result.post_type === 'review')).toBe(true)
  })
})
