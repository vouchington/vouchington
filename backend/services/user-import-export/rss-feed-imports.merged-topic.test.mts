import { describe, expect, it } from 'vitest'
import {
  createTestTopic,
  createTestUser,
  insertTestRssFeedDirect,
  WEB_PROVENANCE,
} from '@voucha/test-helpers'
import { getFirstRssFeedImportRowId } from '@voucha/test-helpers/rss-feed-import-rows'
import { getTopicByAny } from '@services/topics/get'
import { mergeTopicAliases } from '@services/topics/merge-aliases'
import {
  getRssFeedImport,
  processRssFeedImportRow,
  submitRssFeedImport,
} from './rss-feed-imports.mts'

describe('RSS feed import topic links', () => {
  it('returns the active merge target slug after an imported feed topic is merged', async () => {
    const user = await createTestUser({ administrator: true })
    const source = await createTestTopic({ user })
    const destination = await createTestTopic({ user })
    const feedUrl = `https://merged-import-${crypto.randomUUID()}.example.com/feed.xml`
    const feed = await insertTestRssFeedDirect({ topicId: source.id, rssFeedUrl: feedUrl })
    const submitted = await submitRssFeedImport(user, WEB_PROVENANCE, [feedUrl])
    await processRssFeedImportRow(
      submitted.import.id,
      await getFirstRssFeedImportRowId(submitted.import.id),
    )
    const sourceTopic = await getTopicByAny(source.id)
    const destinationTopic = await getTopicByAny(destination.id)
    if (!sourceTopic || !destinationTopic) throw new Error('Import topic fixture missing')

    await mergeTopicAliases(user, sourceTopic, destinationTopic)

    const status = await getRssFeedImport(user.id, submitted.import.id)
    expect(status?.rows[0]).toMatchObject({
      status: 'followed',
      entity_id: feed.id,
      topic_slug: destinationTopic.slug,
    })
  })
})
