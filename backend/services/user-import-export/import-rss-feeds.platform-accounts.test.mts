import { describe, expect, it } from 'vitest'
import {
  countTopicElectionVoteRowsForUser,
  createTestUser,
  getRssFeedFollowExistsForTest,
  WEB_PROVENANCE,
} from '@voucha/test-helpers'
import { createRssFeedImportRowForTest } from '@voucha/test-helpers/rss-feed-import-rows'
import {
  createPlatformAccountTestUser,
  type PlatformAccountTestKind,
} from '@voucha/test-helpers/account-types'
import { onceElectionVoteStatsCompleted } from '@voucha/test-helpers/election-vote-stats'
import { findExistingFeedByUrl } from '@services/rss-feeds/find-existing-feed'
import { importSingleRssFeed, type ImportSingleRssFeedOptions } from './import-rss-feeds.mts'

const KINDS: PlatformAccountTestKind[] = ['official', 'system', 'ai_agent']

function feedFixture(label: string) {
  const random = Math.random().toString(36).slice(2, 12)
  const title = `Import Platform Feed ${random}`
  const body = `<?xml version="1.0"?><rss version="2.0"><channel><title>${title}</title><link>https://example.com/</link><description>Feed</description></channel></rss>`
  const crawlerRssOptions: ImportSingleRssFeedOptions['crawlerRssOptions'] = {
    dependencies: {
      fetchUrl: async () => ({
        response: new Response(body, { headers: { 'content-type': 'application/rss+xml' } }),
        responseSignal: new AbortController().signal,
      }),
    },
  }
  return { feedUrl: `https://${label}-${random}.example.com/feed.xml`, crawlerRssOptions }
}

describe('importSingleRssFeed automatic vote for platform accounts', () => {
  it.each(KINDS)('creates and follows a new feed for a %s account without voting', async kind => {
    const account = await createPlatformAccountTestUser(kind)
    const { feedUrl, crawlerRssOptions } = feedFixture('import-platform-new')

    const importRowId = await createRssFeedImportRowForTest(account.id, feedUrl)
    const result = await importSingleRssFeed(account, WEB_PROVENANCE, feedUrl, {
      importRowId,
      crawlerRssOptions,
    })

    expect(result.status).toBe('source_created')
    expect(await getRssFeedFollowExistsForTest(account.id, result.entity_id!)).toBe(true)
    expect(await countTopicElectionVoteRowsForUser(account.id)).toBe(0)
  })

  it.each(KINDS)('follows an existing feed for a %s account without voting', async kind => {
    const member = await createTestUser()
    const account = await createPlatformAccountTestUser(kind)
    const { feedUrl, crawlerRssOptions } = feedFixture('import-platform-existing')
    const memberImportRowId = await createRssFeedImportRowForTest(member.id, feedUrl)
    const created = await importSingleRssFeed(member, WEB_PROVENANCE, feedUrl, {
      importRowId: memberImportRowId,
      crawlerRssOptions,
    })

    const accountImportRowId = await createRssFeedImportRowForTest(account.id, feedUrl)
    const result = await importSingleRssFeed(account, WEB_PROVENANCE, feedUrl, {
      importRowId: accountImportRowId,
      crawlerRssOptions,
    })

    expect(result).toMatchObject({ status: 'followed', entity_id: created.entity_id })
    expect(await getRssFeedFollowExistsForTest(account.id, created.entity_id!)).toBe(true)
    expect(await countTopicElectionVoteRowsForUser(account.id)).toBe(0)
  })

  it('still casts the automatic +1 when a member imports a new feed', async () => {
    const member = await createTestUser()
    const { feedUrl, crawlerRssOptions } = feedFixture('import-member-new')

    const importRowId = await createRssFeedImportRowForTest(member.id, feedUrl)
    const result = await importSingleRssFeed(member, WEB_PROVENANCE, feedUrl, {
      importRowId,
      crawlerRssOptions,
    })
    const feed = await findExistingFeedByUrl(feedUrl, { readOnly: false })
    if (!feed) throw new Error(`Created RSS feed at ${feedUrl} was not persisted`)
    expect(feed.id).toBe(result.entity_id)
    await onceElectionVoteStatsCompleted({ electionId: feed.topic_id, orderingKey: 'topic' })

    expect(await countTopicElectionVoteRowsForUser(member.id)).toBe(1)
  })
})
