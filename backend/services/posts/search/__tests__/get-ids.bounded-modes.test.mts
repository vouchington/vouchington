import { describe, expect, it } from 'vitest'
import {
  createRandomString,
  createTestUser,
  followUser,
  setPostDeletedForTest,
} from '@voucha/test-helpers'
import { insertTestCommunity } from '@voucha/test-helpers/entities/communities'
import { insertTestPost } from '@voucha/test-helpers/entities/posts'
import { insertTestCommunityPostReview } from '@voucha/test-helpers/entities/community-post-reviews'
import { withDominantPostFixtures } from '@voucha/test-helpers/entities/trending-posts'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { postsWorkConfig } from '../../work-limits.mts'
import { getPostIds } from '../get-ids.mts'

describe('bounded post search modes', () => {
  it('finishes a relevance cohort before advancing to older candidates', async () => {
    await postsWorkConfig.waitForInitialization()
    const user = await createTestUser()
    const restore = overrideDynamicConfigFieldsForTest(postsWorkConfig, {
      post_search_filter_candidate_limit: 2,
    })
    try {
      await withDominantPostFixtures(
        [997, 998, 999].map(milliseconds => ({
          createdAt: new Date(`9999-12-31T23:59:59.${milliseconds}Z`),
          votesScoreUp: 1,
          createdById: user.id,
        })),
        async ([oldest, middle, newest]) => {
          const options = {
            user_id: user.id,
            text_search_query: 'Trending',
            sort: 'relevance' as const,
            time_range: 'all' as const,
            limit: 1,
          }
          const first = await getPostIds(user, options)
          const second = await getPostIds(user, { ...options, after: first.page_info.end_cursor! })
          const third = await getPostIds(user, { ...options, after: second.page_info.end_cursor! })
          expect(first.page_info.has_next_page).toBe(true)
          expect(second.page_info.has_next_page).toBe(true)
          expect([first.results[0]?.id, second.results[0]?.id].toSorted()).toEqual(
            [middle, newest].toSorted(),
          )
          expect(third.results.map(row => row.id)).toEqual([oldest])
        },
      )
    } finally {
      restore()
    }
  })

  it.each(['new', 'best'] as const)(
    'returns the matching %s post when newer rows are excluded',
    async sort => {
      await postsWorkConfig.waitForInitialization()
      const user = await createTestUser()
      const restore = overrideDynamicConfigFieldsForTest(postsWorkConfig, {
        post_search_filter_candidate_limit: 2,
      })
      try {
        await withDominantPostFixtures(
          [997, 998, 999].map((milliseconds, index) => ({
            createdAt: new Date(`9999-12-31T23:59:59.${milliseconds}Z`),
            votesScoreUp: 100000000 + index,
            createdById: user.id,
          })),
          async ([oldest, middle, newest]) => {
            const options = {
              user_id: user.id,
              sort,
              time_range: 'all' as const,
              exclude_post_ids: [newest!, middle!],
              limit: 1,
            }
            const first = await getPostIds(user, options)
            expect(first.results.map(row => row.id)).toEqual([oldest])
            expect(first.page_info.has_next_page).toBe(false)
          },
        )
      } finally {
        restore()
      }
    },
  )

  it('continues from followed posts to other posts in the same community', async () => {
    await postsWorkConfig.waitForInitialization()
    const viewer = await createTestUser()
    const followed = await createTestUser()
    const other = await createTestUser()
    await followUser(viewer, followed)
    const community = await insertTestCommunity({ createdById: viewer.id })
    const suffix = createRandomString(8)
    const ids = []
    for (const [index, author] of [other, followed, followed].entries()) {
      const id = await insertTestPost({
        title: `${index === 0 ? 'Following '.repeat(12) : 'Following '}transition ${suffix} ${index}`,
        slug: `following-transition-${suffix}-${index}`,
        markdown: 'Following transition',
        createdById: author.id,
        communityId: community.id,
      })
      await insertTestCommunityPostReview({ communityId: community.id, postId: id })
      ids.push(id)
    }
    const restore = overrideDynamicConfigFieldsForTest(postsWorkConfig, {
      post_search_filter_candidate_limit: 2,
    })
    try {
      const options = {
        community_id: community.id,
        sort: 'following_new' as const,
        time_range: 'all' as const,
        limit: 1,
      }
      const seen: string[] = []
      let after: string | undefined
      for (let page = 0; page < 6; page++) {
        const result = await getPostIds(viewer, { ...options, after })
        seen.push(...result.results.map(row => row.id))
        if (!result.page_info.has_next_page) break
        after = result.page_info.end_cursor ?? undefined
        if (!after) throw new Error('Expected a continuation cursor')
      }
      expect(seen).toEqual([ids[2], ids[1], ids[0]])
      const relevanceOptions = {
        ...options,
        sort: 'relevance' as const,
        text_search_query: 'Following',
      }
      const following = await getPostIds(viewer, options)
      const relevance = await getPostIds(viewer, relevanceOptions)
      expect(following.page_info.end_cursor).toEqual(expect.any(String))
      expect(relevance.page_info.end_cursor).toEqual(expect.any(String))
      const relevanceSecond = await getPostIds(viewer, {
        ...relevanceOptions,
        after: relevance.page_info.end_cursor!,
      })
      const relevanceThird = await getPostIds(viewer, {
        ...relevanceOptions,
        after: relevanceSecond.page_info.end_cursor!,
      })
      expect([
        relevance.results[0]?.id,
        relevanceSecond.results[0]?.id,
        relevanceThird.results[0]?.id,
      ]).toEqual([ids[0], ids[2], ids[1]])
      await expect(
        getPostIds(viewer, { ...relevanceOptions, after: following.page_info.end_cursor! }),
      ).rejects.toMatchObject({ status: 400 })
      await expect(
        getPostIds(viewer, { ...options, after: relevance.page_info.end_cursor! }),
      ).rejects.toMatchObject({ status: 400 })
      await expect(
        getPostIds(viewer, { ...relevanceOptions, after: 'invalid!!!' }),
      ).rejects.toMatchObject({ status: 400 })
      await expect(getPostIds(viewer, { ...options, after: 'invalid!!!' })).rejects.toMatchObject({
        status: 400,
      })
    } finally {
      restore()
    }
  })

  it('returns the older visible post when newer author posts are deleted', async () => {
    await postsWorkConfig.waitForInitialization()
    const author = await createTestUser()
    const restore = overrideDynamicConfigFieldsForTest(postsWorkConfig, {
      post_search_filter_candidate_limit: 2,
    })
    try {
      await withDominantPostFixtures(
        [997, 998, 999].map(milliseconds => ({
          createdAt: new Date(`9999-12-31T23:59:59.${milliseconds}Z`),
          votesScoreUp: 1,
          createdById: author.id,
        })),
        async ([oldest, middle, newest]) => {
          await setPostDeletedForTest(newest!)
          await setPostDeletedForTest(middle!)
          const options = {
            user_id: author.id,
            sort: 'new' as const,
            time_range: 'all' as const,
            limit: 1,
          }
          const first = await getPostIds(author, options)
          expect(first.results.map(row => row.id)).toEqual([oldest])
          expect(first.page_info.has_next_page).toBe(false)
        },
      )
    } finally {
      restore()
    }
  })

  it('returns the matching followed post when newer rows are excluded', async () => {
    await postsWorkConfig.waitForInitialization()
    const viewer = await createTestUser()
    const followed = await createTestUser()
    await followUser(viewer, followed)
    const restore = overrideDynamicConfigFieldsForTest(postsWorkConfig, {
      post_search_filter_candidate_limit: 2,
    })
    try {
      await withDominantPostFixtures(
        [997, 998, 999].map(milliseconds => ({
          createdAt: new Date(`9999-12-31T23:59:59.${milliseconds}Z`),
          votesScoreUp: 1,
          createdById: followed.id,
        })),
        async ([oldest, middle, newest]) => {
          const options = {
            user_id: followed.id,
            sort: 'following_new' as const,
            time_range: 'all' as const,
            exclude_post_ids: [newest!, middle!],
            limit: 1,
          }
          const first = await getPostIds(viewer, options)
          expect(first.results.map(row => row.id)).toEqual([oldest])
          expect(first.page_info.has_next_page).toBe(false)
        },
      )
    } finally {
      restore()
    }
  })
})
