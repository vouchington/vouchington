import { it, expect, describe } from 'vitest'
import { getUserMetricsByAnyBatch } from '@services/users/metrics-batch'
import {
  createTestPost,
  createTestTopic,
  createTestUser,
  createUserProfileFixture,
  WEB_PROVENANCE,
} from '@voucha/test-helpers'
import { createPost } from '@services/posts/create'
import type { PrivateUser } from '@services/users/types'

describe('metrics-batch', () => {
  it('getUserMetricsByAnyBatch returns empty array for empty input', async () => {
    const results = await getUserMetricsByAnyBatch([])
    expect(results).toEqual([])
  })

  it('getUserMetricsByAnyBatch fetches multiple user metrics by IDs in correct order', async () => {
    const user1 = (await createTestUser({})) as PrivateUser
    const user2 = (await createTestUser({})) as PrivateUser
    const user3 = (await createTestUser({})) as PrivateUser
    // Fetch in specific order
    const results = await getUserMetricsByAnyBatch([user2.id, user1.id, user3.id])

    expect(results).toHaveLength(3)
    expect(results[0]?.id).toBe(user2.id)
    expect(results[1]?.id).toBe(user1.id)
    expect(results[2]?.id).toBe(user3.id)
    // Verify metrics fields exist
    expect(results[0]).toHaveProperty('bookmarks')
    expect(results[0]?.bookmarks).toHaveProperty('follow')
    expect(results[0]).toHaveProperty('bookmarkers')
  })

  it('getUserMetricsByAnyBatch fetches by usernames', async () => {
    const username1 = `metricsuser1-${Date.now()}-${Math.floor(Math.random() * 1000000)}`
    const username2 = `metricsuser2-${Date.now()}-${Math.floor(Math.random() * 1000000)}`

    const user1 = (await createTestUser({ username: username1 })) as PrivateUser
    const user2 = (await createTestUser({ username: username2 })) as PrivateUser
    const results = await getUserMetricsByAnyBatch([username2, username1])

    expect(results).toHaveLength(2)
    expect(results[0]?.id).toBe(user2.id)
    expect(results[1]?.id).toBe(user1.id)
  })

  it('getUserMetricsByAnyBatch returns null for non-existent users while preserving order', async () => {
    const user = (await createTestUser({})) as PrivateUser
    const results = await getUserMetricsByAnyBatch([
      '00000000-0000-0000-0000-000000000099',
      user.id,
    ])

    expect(results).toHaveLength(2)
    expect(results[0]).toBeNull()
    expect(results[1]?.id).toBe(user.id)
  })

  it('getUserMetricsByAnyBatch returns public counts for mixed identifiers', async () => {
    const fixture = await createUserProfileFixture({
      suffix: `batch-${Date.now()}`,
    })

    const results = await getUserMetricsByAnyBatch([fixture.owner.username!, fixture.owner.id])

    expect(results).toHaveLength(2)

    for (const metrics of results) {
      expect(metrics).toMatchObject({
        id: fixture.owner.id,
        count: {
          reviews: 1,
          discussions: 1,
          comments: 1,
          users_following: 1,
          users_followers: 1,
          topics_following: 1,
          rss_feeds_following: 1,
        },
      })
      expect(metrics?.viewer_count).toBeUndefined()
      expect(metrics?.private_count).toBeUndefined()
    }
  })

  it(
    'getUserMetricsByAnyBatch excludes non-public authored posts from public counts',
    { timeout: 60_000 },
    async () => {
      const fixture = await createUserProfileFixture({
        suffix: `private-${Date.now()}`,
      })

      const privateDiscussion = await createTestPost({
        user: fixture.owner,
        post_type: 'discussion',
        title: `Private discussion ${Date.now()}`,
        markdown: 'Hidden discussion',
        broadcast: 'users',
      })

      await createTestPost({
        user: fixture.owner,
        post_type: 'comment',
        parent_id: privateDiscussion!.id,
        root_id: privateDiscussion!.id,
        markdown: 'Hidden comment',
      })

      const privateReviewTopic = await createTestTopic({ user: fixture.owner })

      await createPost(WEB_PROVENANCE, fixture.owner, {
        post_type: 'review',
        title: `Private review ${Date.now()}`,
        markdown:
          'This product has been a reliable part of my daily routine for several months now. The quality is consistently high and the value for money is excellent. I would recommend it to anyone looking for a dependable solution.',
        broadcast: 'users',
        review_topic_ratings: [{ topic_id: privateReviewTopic.id, rating: 4 }],
      })
      const [metrics] = await getUserMetricsByAnyBatch([fixture.owner.id])

      expect(metrics).toMatchObject({
        id: fixture.owner.id,
        count: {
          reviews: 1,
          discussions: 1,
          comments: 1,
        },
      })
    },
  )
})
