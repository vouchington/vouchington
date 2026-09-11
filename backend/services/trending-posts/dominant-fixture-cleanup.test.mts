import { describe, expect, it } from 'vitest'
import {
  createTrendingPostData,
  type DominantPostFixtureSpec,
  withDominantPostFixtures,
} from '@voucha/test-helpers/entities/trending-posts'
import { deleteTestPost, getTestPostDeletedAt } from '@voucha/test-helpers/entities/posts'
import { getTrendingPosts } from './get-trending-posts.mts'

describe('getTrendingPosts - dominant fixture cleanup on failure', () => {
  it('deletes an inserted fixture when creation rejects before returning its ID', async () => {
    let insertedPostId: string | undefined

    async function rejectAfterCreate(
      fixture: Awaited<ReturnType<typeof createTrendingPostData>>,
    ): Promise<void> {
      insertedPostId = fixture.postId
      throw new Error('simulated failure after fixture insertion')
    }

    const dominantSpec = {
      votesScoreUp: 2_000_000_000,
      postType: 'data_point',
      createdAt: new Date('9999-12-31T23:59:59.000Z'),
    } as const

    await expect(
      withDominantPostFixtures([dominantSpec], async () => undefined, {
        afterCreateForTest: rejectAfterCreate,
      }),
    ).rejects.toThrow('simulated failure after fixture insertion')

    expect(insertedPostId).toBeDefined()
    expect(await getTestPostDeletedAt(insertedPostId!)).toBeInstanceOf(Date)
  })

  it('generates cleanup ownership independently of a caller-provided postId', async () => {
    const existingFixture = await createTrendingPostData({ votesScoreUp: 1 })
    let ownedPostId: string | undefined
    const specWithSmuggledId = {
      votesScoreUp: 2_000_000_000,
      postType: 'data_point',
      createdAt: new Date('9999-12-31T23:59:59.000Z'),
      postId: existingFixture.postId,
    } as const satisfies DominantPostFixtureSpec & { postId: string }

    try {
      await withDominantPostFixtures([specWithSmuggledId], async ([postId]) => {
        ownedPostId = postId
        expect(postId).not.toBe(existingFixture.postId)
      })

      expect(await getTestPostDeletedAt(existingFixture.postId)).toBeNull()
      expect(await getTestPostDeletedAt(ownedPostId!)).toBeInstanceOf(Date)
    } finally {
      await deleteTestPost(existingFixture.postId)
    }
  })

  it('keeps cleanup ownership private from callback array mutations', async () => {
    const existingFixture = await createTrendingPostData({ votesScoreUp: 1 })
    let ownedPostIds: readonly string[] | undefined

    try {
      await withDominantPostFixtures(
        [{ votesScoreUp: 2_000_000_000 }, { votesScoreUp: 2_000_000_001 }],
        async postIds => {
          ownedPostIds = [...postIds]
          const mutablePostIds = postIds as string[]

          expect(() => mutablePostIds.push(existingFixture.postId)).toThrow(TypeError)
          expect(() => mutablePostIds.pop()).toThrow(TypeError)
          expect(() => mutablePostIds.splice(0, 1, existingFixture.postId)).toThrow(TypeError)
        },
      )

      expect(ownedPostIds).toHaveLength(2)
      await Promise.all(
        ownedPostIds!.map(async postId => {
          expect(await getTestPostDeletedAt(postId)).toBeInstanceOf(Date)
        }),
      )
      expect(await getTestPostDeletedAt(existingFixture.postId)).toBeNull()
    } finally {
      await deleteTestPost(existingFixture.postId)
    }
  })

  it('keeps cleanup ownership private when the callback tries to replace its snapshot', async () => {
    const existingFixture = await createTrendingPostData({ votesScoreUp: 1 })
    let ownedPostId: string | undefined

    try {
      await expect(
        withDominantPostFixtures(
          [
            {
              votesScoreUp: 2_000_000_000,
              postType: 'data_point',
              createdAt: new Date('9999-12-31T23:59:59.000Z'),
            },
          ],
          async postIds => {
            ownedPostId = postIds[0]
            const mutableSnapshot = postIds as string[]
            mutableSnapshot.splice(0, 1, existingFixture.postId)
          },
        ),
      ).rejects.toThrow(TypeError)

      expect(await getTestPostDeletedAt(existingFixture.postId)).toBeNull()
      expect(await getTestPostDeletedAt(ownedPostId!)).toBeInstanceOf(Date)
    } finally {
      await deleteTestPost(existingFixture.postId)
    }
  })

  it('deletes a non-decaying far-future fixture when the guarded block throws', async () => {
    const votesScoreUp = 2_000_000_000
    let capturedPostId: string | undefined

    await expect(
      withDominantPostFixtures(
        [
          {
            votesScoreUp,
            postType: 'data_point',
            createdAt: new Date('9999-12-31T23:59:59.000Z'),
          },
        ],
        async ([postId]) => {
          capturedPostId = postId
          throw new Error('simulated assertion failure inside the guarded block')
        },
      ),
    ).rejects.toThrow('simulated assertion failure inside the guarded block')

    expect(capturedPostId).toBeDefined()

    const result = await getTrendingPosts({
      timeRange: 'day',
      postType: 'data_point',
      limit: 100,
      minScore: 1,
    })

    expect(result.results.find(row => row.id === capturedPostId)).toBeUndefined()
  })
})
