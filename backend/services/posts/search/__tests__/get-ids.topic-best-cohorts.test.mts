import { describe, expect, it } from 'vitest'
import {
  createRandomString,
  createTestUser,
  insertTestTopic,
  setPostDeletedForTest,
} from '@voucha/test-helpers'
import { insertTestDataPoint } from '@voucha/test-helpers/entities/data-points'
import { setPostVotesScoreUp } from '@voucha/test-helpers/entities/posts'
import { insertTestPostDataTopics } from '@voucha/test-helpers/publication-test-queries'
import { postsWorkConfig } from '../../work-limits.mts'
import { getPostIds } from '../get-ids.mts'

describe('topic-scoped data point best cohorts', () => {
  it.each([true, false])(
    'ranks a higher scored older post ahead of newer lower scores with explicit type %s',
    async explicitType => {
      await postsWorkConfig.waitForInitialization()
      const user = await createTestUser()
      const token = createRandomString(8)
      const topicId = await insertTestTopic({
        name: `Topic ${token}`,
        slug: `topic-${token}`,
        createdById: user.id,
      })
      const ids: string[] = []
      for (let index = 0; index < 3; index++) {
        const id = await insertTestDataPoint({
          title: `Point ${token} ${index}`,
          slug: `point-${token}-${index}`,
          createdById: user.id,
          topicId,
        })
        await setPostVotesScoreUp(id, index === 0 ? 100 : 2)
        ids.push(id)
      }
      const options = {
        data_point_topic_ids: [topicId],
        ...(explicitType ? { post_types: ['data_point'] as Array<'data_point'> } : {}),
        sort: 'best' as const,
        time_range: 'all' as const,
        limit: 1,
      }
      const first = await getPostIds(user, options)
      expect(first.results.map(row => row.id)).toEqual([ids[0]])
      expect(first.page_info.has_next_page).toBe(true)
      const second = await getPostIds(user, {
        ...options,
        after: first.page_info.end_cursor!,
      })
      expect(second.results.map(row => row.id)).toEqual([ids[2]])
      expect(second.page_info.has_next_page).toBe(true)
      const third = await getPostIds(user, {
        ...options,
        after: second.page_info.end_cursor!,
      })
      expect(third.results.map(row => row.id)).toEqual([ids[1]])
      await expect(
        getPostIds(user, {
          ...options,
          sort: 'new',
          after: first.page_info.end_cursor!,
        }),
      ).rejects.toMatchObject({ status: 400 })
    },
  )

  it('advances past a deleted and a filtered topic key to an older post', async () => {
    await postsWorkConfig.waitForInitialization()
    const user = await createTestUser()
    const token = createRandomString(8)
    const topicId = await insertTestTopic({
      name: `Topic ${token}`,
      slug: `topic-${token}`,
      createdById: user.id,
    })
    const secondTopicId = await insertTestTopic({
      name: `Second topic ${token}`,
      slug: `second-topic-${token}`,
      createdById: user.id,
    })
    const ids: string[] = []
    for (let index = 0; index < 3; index++) {
      ids.push(
        await insertTestDataPoint({
          title: `Point ${token} ${index}`,
          slug: `point-${token}-${index}`,
          createdById: user.id,
          topicId,
        }),
      )
    }
    await insertTestPostDataTopics(ids[0]!, [secondTopicId])
    await setPostDeletedForTest(ids[2]!)
    const options = {
      data_point_topic_ids: [topicId, secondTopicId],
      post_types: ['data_point'] as Array<'data_point'>,
      sort: 'best' as const,
      time_range: 'all' as const,
      limit: 1,
    }
    const first = await getPostIds(user, options)
    expect(first.results.map(row => row.id)).toEqual([ids[0]])
    expect(first.page_info.has_next_page).toBe(false)
  })
})
