import { randomUUID } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'
import {
  createTestTopic,
  createTestUser,
  createTestUserWithAge,
  CONTRIBUTING_USER_AGE_MS,
  getRssFeedImportRequestForTest,
  getTopicFollowExistsForTest,
  getTopicImportRequestForTest,
  getTopicImportRequestByRecommendationForTest,
  getTopicImportRequestCountByRecommendationForTest,
  insertPendingTopicImportRequestForTest,
  insertTestRssFeedDirect,
  WEB_PROVENANCE,
} from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'
import { createTopicRecommendation } from '@services/topic-recommendations'
import { importSingleRssFeed, importTopics } from './index.mts'
import { autoFollowOnRecommendationApproval } from './auto-follow-on-approval.mts'

const eligibleForTopicRecommendations = () => ({
  assertCanCreateTopicRecommendations: async () => {},
  importAttemptId: randomUUID(),
})
type ImportTopicsOptions = Parameters<typeof importTopics>[3]
function importWebTopics(user: PrivateUser, names: string[], options: ImportTopicsOptions) {
  return importTopics(WEB_PROVENANCE, user, names, options)
}

describe('user import requests', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
  })

  it('records pending topic recommendation imports', async () => {
    const topicName = `Imported Pending Topic ${Date.now()}`

    const [result] = await importWebTopics(user, [topicName], eligibleForTopicRecommendations())

    expect(result).toMatchObject({
      input: topicName,
      status: 'recommendation_created',
    })
    expect(result?.recommendation_post_id).toEqual(expect.any(String))

    const request = await getTopicImportRequestByRecommendationForTest(
      user.id,
      result!.recommendation_post_id!,
    )
    expect(request).toMatchObject({
      topic_id: null,
      topic_recommendation_post_id: result?.recommendation_post_id,
      input_value: topicName,
    })
    expect(request?.followed_at).toBeNull()
  })

  it('accepts a repeated legacy audit insert without duplicating a recommendation request', async () => {
    const recommendation = await createTopicRecommendation(
      WEB_PROVENANCE,
      user,
      {
        topic_title: `Legacy audit ${randomUUID()}`,
        topic_slug: `legacy-audit-${randomUUID()}`,
        markdown: 'Legacy audit writer coverage.',
      },
      { skipCreatedEvents: true },
    )
    const inputValue = `Legacy audit ${randomUUID()}`

    await insertPendingTopicImportRequestForTest(user.id, recommendation.id, inputValue)
    await insertPendingTopicImportRequestForTest(user.id, recommendation.id, inputValue)

    await expect(
      getTopicImportRequestCountByRecommendationForTest(user.id, recommendation.id),
    ).resolves.toBe(1)
  })

  it('records followed topic imports', async () => {
    const topic = await createTestTopic({ user })

    const [result] = await importWebTopics(user, [topic.name], eligibleForTopicRecommendations())

    expect(result).toMatchObject({
      input: topic.name,
      status: 'followed',
      entity_id: topic.id,
    })

    const request = await getTopicImportRequestForTest(user.id, topic.id)
    expect(request).toMatchObject({
      topic_id: topic.id,
      topic_recommendation_post_id: null,
      input_value: topic.name,
    })
    expect(request?.followed_at).toBeInstanceOf(Date)
  })

  it('batches existing topic imports while preserving input order', async () => {
    const first = await createTestTopic({ user })
    const second = await createTestTopic({ user })
    await importWebTopics(user, [first.name], eligibleForTopicRecommendations())

    const results = await importWebTopics(
      user,
      [first.name, second.name, '   '],
      eligibleForTopicRecommendations(),
    )

    expect(results).toEqual([
      expect.objectContaining({
        input: first.name,
        status: 'already_following',
        entity_id: first.id,
      }),
      expect.objectContaining({ input: second.name, status: 'followed', entity_id: second.id }),
      { input: '   ', status: 'error', error: 'Topic name is empty' },
    ])
  })

  it('preserves sequential semantics for duplicate existing topics', async () => {
    const topic = await createTestTopic({ user })

    const results = await importWebTopics(
      user,
      [topic.name, topic.name],
      eligibleForTopicRecommendations(),
    )

    expect(results).toEqual([
      expect.objectContaining({ status: 'followed', entity_id: topic.id }),
      expect.objectContaining({ status: 'already_following', entity_id: topic.id }),
    ])
  })

  it('rejects topic names that cannot produce a slug', async () => {
    await expect(
      importWebTopics(user, ['!!!'], eligibleForTopicRecommendations()),
    ).resolves.toEqual([
      {
        input: '!!!',
        status: 'error',
        error: 'Could not derive a valid slug from name',
      },
    ])
  })

  it('returns an error when the recommendation age gate rejects the import', async () => {
    const topicName = `Rejected Imported Topic ${randomUUID()}`

    await expect(
      importWebTopics(user, [topicName], {
        assertCanCreateTopicRecommendations: async () => {
          throw new Error('recommendation rejected')
        },
        importAttemptId: randomUUID(),
      }),
    ).resolves.toEqual([{ input: topicName, status: 'error', error: 'recommendation rejected' }])
  })

  it('follows existing topics while returning missing recommendations as gated errors', async () => {
    const topic = await createTestTopic({ user })

    const results = await importWebTopics(
      user,
      [topic.name, `Gated Missing Topic ${randomUUID()}`],
      {
        assertCanCreateTopicRecommendations: async () => {
          throw new Error('A verified email address is required to contribute.')
        },
        importAttemptId: randomUUID(),
      },
    )

    expect(results).toEqual([
      expect.objectContaining({ status: 'followed', entity_id: topic.id }),
      expect.objectContaining({
        status: 'error',
        error: 'A verified email address is required to contribute.',
      }),
    ])
    await expect(getTopicFollowExistsForTest(user.id, topic.id)).resolves.toBe(true)
  })

  it('propagates audit persistence failures without applying follows', async () => {
    const topic = await createTestTopic({ user })
    let recordImportRequestCalls = 0
    const auditFailure = new Error('audit persistence failed')
    const recordImportRequests = async () => {
      recordImportRequestCalls += 1
      throw auditFailure
    }

    await expect(
      importWebTopics(user, [topic.name], {
        ...eligibleForTopicRecommendations(),
        recordImportRequests,
      }),
    ).rejects.toBe(auditFailure)
    expect(recordImportRequestCalls).toBe(1)
    await expect(getTopicFollowExistsForTest(user.id, topic.id)).resolves.toBe(false)
  })

  it('records followed RSS feed imports', async () => {
    const rssFeedUrl = `https://import-request-${Date.now()}.example.com/feed.xml`
    const rssFeed = await insertTestRssFeedDirect({
      topicHostname: new URL(rssFeedUrl).hostname,
      rssFeedUrl,
    })

    const result = await importSingleRssFeed(WEB_PROVENANCE, user, rssFeedUrl)

    expect(result).toMatchObject({
      input: rssFeedUrl,
      status: 'followed',
      entity_id: rssFeed.id,
    })

    const request = await getRssFeedImportRequestForTest(user.id, rssFeed.id as string)
    expect(request).toMatchObject({
      topic_id: null,
      rss_feed_id: rssFeed.id,
      input_value: rssFeedUrl,
    })
    expect(request?.followed_at).toBeInstanceOf(Date)
  })

  it('follows users when pending topic import recommendations are approved', async () => {
    const secondUser = await createTestUser()
    const recommendation = await createTopicRecommendation(
      WEB_PROVENANCE,
      user,
      {
        topic_title: 'Imported Pending Topic',
        topic_slug: `imported-pending-topic-${Date.now()}`,
        markdown: 'Imported pending topic.',
      },
      { skipCreatedEvents: true },
    )
    const approvedTopic = await createTestTopic({
      user,
      hostname: `approved-rss-feed-topic-${Date.now()}.example.com`,
    })
    await insertPendingTopicImportRequestForTest(
      user.id,
      recommendation.id,
      'Imported Pending Topic',
    )
    await insertPendingTopicImportRequestForTest(
      secondUser.id,
      recommendation.id,
      'Imported Pending Topic',
    )

    await autoFollowOnRecommendationApproval(recommendation.id, approvedTopic.id)

    const request = await getTopicImportRequestByRecommendationForTest(user.id, recommendation.id)
    expect(request).toMatchObject({ topic_id: approvedTopic.id })
    expect(request?.followed_at).toBeInstanceOf(Date)
    const secondRequest = await getTopicImportRequestByRecommendationForTest(
      secondUser.id,
      recommendation.id,
    )
    expect(secondRequest).toMatchObject({ topic_id: approvedTopic.id })
    expect(secondRequest?.followed_at).toBeInstanceOf(Date)
    await expect(getTopicFollowExistsForTest(user.id, approvedTopic.id)).resolves.toBe(true)
    await expect(getTopicFollowExistsForTest(secondUser.id, approvedTopic.id)).resolves.toBe(true)
  })

  it('does not fail approval when a pending topic import cannot be followed', async () => {
    const recommendation = await createTopicRecommendation(
      WEB_PROVENANCE,
      user,
      {
        topic_title: 'Imported Missing Topic',
        topic_slug: `imported-missing-topic-${Date.now()}`,
        markdown: 'Imported missing topic.',
      },
      { skipCreatedEvents: true },
    )
    await insertPendingTopicImportRequestForTest(
      user.id,
      recommendation.id,
      'Imported Missing Topic',
    )

    await expect(
      autoFollowOnRecommendationApproval(recommendation.id, randomUUID()),
    ).resolves.toBeUndefined()

    const request = await getTopicImportRequestByRecommendationForTest(user.id, recommendation.id)
    expect(request?.topic_id).toBeNull()
    expect(request?.followed_at).toBeNull()
  })
})
