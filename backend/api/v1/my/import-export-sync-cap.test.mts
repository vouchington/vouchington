import {
  deleteDynamicConfigFieldsForTest,
  overrideDynamicConfigFieldsForTest,
} from '@voucha/test-helpers/dynamic-config'
import { afterEach, describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/api/test-helpers/server'
import {
  createTestUser,
  insertEntityRelation,
  insertTestRssFeed,
  insertTestTopic,
} from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'
import { userImportExportConfig } from '@services/user-import-export/config'
import { SYNC_EXPORT_TOO_LARGE } from '@modules/on-error/error-codes'
import { streamUserRssFeeds } from '@services/user-import-export/export-rss-feeds'
import { streamUserTopics } from '@services/user-import-export/export-topics'

describe('GET /api/v1/my/export/rss-feeds synchronous cap', () => {
  afterEach(() => {
    deleteDynamicConfigFieldsForTest(
      userImportExportConfig,
      Object.keys(userImportExportConfig.fieldTypes),
    )
  })

  it('rejects OPML exports above the synchronous export cap', async () => {
    overrideDynamicConfigFieldsForTest(userImportExportConfig, { sync_export_max_items: 1 })
    const cappedUser = await createTestUser()
    await Promise.all([
      createFollowedRssFeed(cappedUser, 'Cap Feed A'),
      createFollowedRssFeed(cappedUser, 'Cap Feed B'),
    ])

    const request = createRequest()
    await request.authenticateAs(cappedUser)
    const response = await request.get('/api/v1/my/export/rss-feeds').expect(413)

    expect(response.body.code).toBe(SYNC_EXPORT_TOO_LARGE)
  })

  it('rejects JSON RSS exports above the synchronous export cap', async () => {
    overrideDynamicConfigFieldsForTest(userImportExportConfig, { sync_export_max_items: 1 })
    const cappedUser = await createTestUser()
    await createFollowedRssFeed(cappedUser, 'Cap JSON Feed A')
    await createFollowedRssFeed(cappedUser, 'Cap JSON Feed B')

    const request = createRequest()
    await request.authenticateAs(cappedUser)
    const response = await request.get('/api/v1/my/export/rss-feeds?format=json').expect(413)

    expect(response.body.code).toBe(SYNC_EXPORT_TOO_LARGE)
  })

  it('applies the configured cap to the RSS cursor query itself', async () => {
    const cappedUser = await createTestUser()
    await createFollowedRssFeed(cappedUser, 'Cursor Cap Feed A')
    await createFollowedRssFeed(cappedUser, 'Cursor Cap Feed B')

    await expect(collect(streamUserRssFeeds(cappedUser.id, 1))).resolves.toHaveLength(1)
  })
})

describe('GET /api/v1/my/export/topics synchronous cap', () => {
  afterEach(() => {
    deleteDynamicConfigFieldsForTest(
      userImportExportConfig,
      Object.keys(userImportExportConfig.fieldTypes),
    )
  })

  it('returns topics at the synchronous export cap', async () => {
    overrideDynamicConfigFieldsForTest(userImportExportConfig, { sync_export_max_items: 1 })
    const cappedUser = await createTestUser()
    await createFollowedTopic(cappedUser, 'At Cap Topic')

    const request = createRequest()
    await request.authenticateAs(cappedUser)
    const response = await request.get('/api/v1/my/export/topics').expect(200)

    expect(response.body.results).toHaveLength(1)
    expect(response.body.results[0].name).toContain('At Cap Topic')
  })

  it('streams multiple topics as a top-level array for file downloads', async () => {
    overrideDynamicConfigFieldsForTest(userImportExportConfig, { sync_export_max_items: 2 })
    const cappedUser = await createTestUser()
    await createFollowedTopic(cappedUser, 'Download Topic A')
    await createFollowedTopic(cappedUser, 'Download Topic B')

    const request = createRequest()
    await request.authenticateAs(cappedUser)
    const response = await request.get('/api/v1/my/export/topics?download=1').expect(200)

    expect(Array.isArray(response.body)).toBe(true)
    expect(response.body).toHaveLength(2)
  })

  it('rejects topic exports above the synchronous export cap', async () => {
    overrideDynamicConfigFieldsForTest(userImportExportConfig, { sync_export_max_items: 1 })
    const cappedUser = await createTestUser()
    await createFollowedTopic(cappedUser, 'Cap Topic A')
    await createFollowedTopic(cappedUser, 'Cap Topic B')

    const request = createRequest()
    await request.authenticateAs(cappedUser)
    const response = await request.get('/api/v1/my/export/topics').expect(413)

    expect(response.body.code).toBe(SYNC_EXPORT_TOO_LARGE)
  })

  it('applies the configured cap to the topic cursor query itself', async () => {
    const cappedUser = await createTestUser()
    await createFollowedTopic(cappedUser, 'Cursor Cap Topic A')
    await createFollowedTopic(cappedUser, 'Cursor Cap Topic B')

    await expect(collect(streamUserTopics(cappedUser.id, 1))).resolves.toHaveLength(1)
  })
})

async function createFollowedTopic(user: PrivateUser, name: string): Promise<string> {
  const suffix = Math.random().toString(36).slice(2)
  const topicName = `${name} ${suffix}`
  const slug = `${name.toLowerCase().replaceAll(' ', '-')}-${suffix}`
  const topicId = await insertTestTopic({
    name: topicName,
    slug,
    createdById: user.id,
  })
  await insertEntityRelation('relation__user__follow__topic', user.id, topicId)
  return topicId
}

async function collect<T>(values: AsyncIterable<T>): Promise<T[]> {
  const result: T[] = []
  for await (const value of values) result.push(value)
  return result
}

async function createFollowedRssFeed(user: PrivateUser, title: string): Promise<string> {
  const topicId = await createFollowedTopic(user, `${title} Topic`)
  const feedId = await insertTestRssFeed({
    topicId,
    title,
    rssFeedUrl: `https://${title.toLowerCase().replaceAll(' ', '-')}-${Math.random().toString(36).slice(2)}.example.com/feed.xml`,
  })
  await insertEntityRelation('relation__user__follow__rss_feed', user.id, feedId)
  return feedId
}
