import { describe, expect, it } from 'vitest'
import {
  createRandomString,
  createTestPost,
  createTestTopic,
  createTestUser,
  createTopHashtagAliasForTest,
  createTopHashtagPostSourceForTest,
  insertScoredPostTopicCategoryRelation,
  insertTestReview,
} from '@voucha/test-helpers'
import { insertTestDataPoint } from '@voucha/test-helpers/entities/data-points'
import { createActivePostTopicAliasRelationForTest } from '@voucha/test-helpers/entities/top-hashtags'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { postsWorkConfig } from '../../work-limits.mts'
import { getPostIds } from '../get-ids.mts'

describe('single universal-topic post search', () => {
  it('requires every topic term and any separate alias term', async () => {
    const user = await createTestUser()
    const firstTopic = await createTestTopic({ user })
    const secondTopic = await createTestTopic({ user })
    const partial = await createTestPost({ user })
    const direct = await createTestPost({ user })
    const aliases = await createTestPost({ user })
    await insertScoredPostTopicCategoryRelation(partial.id, firstTopic.id, user.id)
    await insertScoredPostTopicCategoryRelation(direct.id, firstTopic.id, user.id)
    await insertScoredPostTopicCategoryRelation(direct.id, secondTopic.id, user.id)
    const firstAlias = await createTopHashtagAliasForTest(
      firstTopic.id,
      `and-first-${createRandomString(10)}`,
    )
    const secondAlias = await createTopHashtagAliasForTest(
      secondTopic.id,
      `and-second-${createRandomString(10)}`,
    )
    await createActivePostTopicAliasRelationForTest({
      postId: aliases.id,
      topicAliasId: firstAlias,
      userId: user.id,
    })
    await createActivePostTopicAliasRelationForTest({
      postId: aliases.id,
      topicAliasId: secondAlias,
      userId: user.id,
    })
    const options = {
      user_id: user.id,
      universal_topic_ids: [firstTopic.id, secondTopic.id],
      sort: 'new' as const,
      time_range: 'all' as const,
      limit: 10,
    }
    const topics = await getPostIds(undefined, options)
    expect(topics.results.map(row => row.id).toSorted()).toEqual([direct.id, aliases.id].toSorted())
    const withAlias = await getPostIds(undefined, {
      ...options,
      hashtag_alias_ids: [firstAlias],
    })
    expect(withAlias.results.map(row => row.id)).toEqual([aliases.id])
  })

  it('continues after short and empty bounded topic pages', async () => {
    await postsWorkConfig.waitForInitialization()
    const user = await createTestUser()
    const topic = await createTestTopic({ user })
    const posts = await Promise.all(Array.from({ length: 5 }, () => createTestPost({ user })))
    const orderedIds = posts
      .map(post => post.id)
      .toSorted()
      .toReversed()
    const newestId = orderedIds[0]
    const oldestId = orderedIds[4]
    await insertScoredPostTopicCategoryRelation(newestId, topic.id, user.id)
    await insertScoredPostTopicCategoryRelation(oldestId, topic.id, user.id)
    const restore = overrideDynamicConfigFieldsForTest(postsWorkConfig, {
      post_search_filter_candidate_limit: 2,
    })
    try {
      const options = {
        user_id: user.id,
        universal_topic_ids: [topic.id],
        sort: 'new' as const,
        time_range: 'all' as const,
        limit: 2,
      }
      const first = await getPostIds(undefined, options)
      expect(first.results.map(row => row.id)).toEqual([newestId])
      expect(first.page_info.has_next_page).toBe(true)
      expect(first.page_info.end_cursor).toEqual(expect.any(String))
      const second = await getPostIds(undefined, {
        ...options,
        after: first.page_info.end_cursor!,
      })
      expect(second.results).toEqual([])
      expect(second.page_info.has_next_page).toBe(true)
      const third = await getPostIds(undefined, {
        ...options,
        after: second.page_info.end_cursor!,
      })
      expect(third.results.map(row => row.id)).toEqual([oldestId])
    } finally {
      restore()
    }
  })

  it('returns each of the four membership families once and continues newest pagination', async () => {
    const user = await createTestUser()
    const topic = await createTestTopic({ user })
    const suffix = createRandomString(10)
    const direct = await createTestPost({ user })
    await insertScoredPostTopicCategoryRelation(direct.id, topic.id, user.id)

    const aliasPost = await createTestPost({ user })
    const firstAlias = await createTopHashtagAliasForTest(topic.id, `universal-${suffix}-1`)
    const secondAlias = await createTopHashtagAliasForTest(topic.id, `universal-${suffix}-2`)
    await createTopHashtagPostSourceForTest({
      postId: aliasPost.id,
      topicAliasId: firstAlias,
      userId: user.id,
      authoredToken: `#universal-${suffix}-1`,
    })
    await createActivePostTopicAliasRelationForTest({
      postId: aliasPost.id,
      topicAliasId: secondAlias,
      userId: user.id,
    })

    const reviewId = await insertTestReview({
      userId: user.id,
      topicRatings: [{ topicId: topic.id, rating: 5 }],
    })
    const dataPointId = await insertTestDataPoint({
      title: `Universal topic ${suffix}`,
      slug: `universal-topic-${suffix}`,
      createdById: user.id,
      topicId: topic.id,
    })
    const expected = [direct.id, aliasPost.id, reviewId, dataPointId].toSorted().toReversed()
    const options = {
      user_id: user.id,
      universal_topic_ids: [topic.id],
      sort: 'new' as const,
      time_range: 'all' as const,
      limit: 2,
    }

    const first = await getPostIds(undefined, options)
    expect(first.results.map(row => row.id)).toEqual(expected.slice(0, 2))
    expect(first.page_info.has_next_page).toBe(true)
    const second = await getPostIds(undefined, {
      ...options,
      after: first.page_info.end_cursor!,
    })
    expect(second.results.map(row => row.id)).toEqual(expected.slice(2))
  })
})
