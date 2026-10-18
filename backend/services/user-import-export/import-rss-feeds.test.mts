import { randomUUID } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'
import {
  countTopicElectionVoteRowsForUser,
  createTestTopic,
  createTestUser,
  getRssFeedFollowExistsForTest,
  getRssFeedImportRequestForTest,
  getRssFeedTypeForTest,
  getTestRssFeedUrlHostnameId,
  getTopicElectionVoteEventCount,
  insertTestRssFeedDirect,
  updateUrlHostnameBlocked,
  WEB_PROVENANCE,
} from '@voucha/test-helpers'
import {
  createRssFeedImportRowForTest,
  getRssFeedUrlForTest,
} from '@voucha/test-helpers/rss-feed-import-rows'
import type { PrivateUser } from '@services/users/types'
import { setCanonicalRssFeed } from '@services/rss-feeds/set-canonical'
import { importSingleRssFeed, type ImportSingleRssFeedOptions } from './import-rss-feeds.mts'

function rssCrawlerOptions(title: string): ImportSingleRssFeedOptions['crawlerRssOptions'] {
  const body = `<?xml version="1.0"?><rss version="2.0"><channel><title>${title}</title><link>https://example.com/</link><description>Feed</description></channel></rss>`
  return {
    dependencies: {
      fetchUrl: async () => ({
        response: new Response(body, { headers: { 'content-type': 'application/rss+xml' } }),
        responseSignal: new AbortController().signal,
      }),
    },
  }
}

async function importWithOwnedRow(
  user: PrivateUser,
  inputUrl: string,
  options: Omit<ImportSingleRssFeedOptions, 'importRowId'> = {},
) {
  const importRowId = await createRssFeedImportRowForTest(user.id, inputUrl)
  return importSingleRssFeed(user, WEB_PROVENANCE, inputUrl, { ...options, importRowId })
}

describe('importSingleRssFeed', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
  })

  it('records followed imports for newly created sources', async () => {
    const rssFeedUrl = `https://new-source-import-${randomUUID()}.example.com/feed.xml`
    const result = await importWithOwnedRow(user, rssFeedUrl, {
      crawlerRssOptions: rssCrawlerOptions('New Source Import Feed'),
    })

    expect(result).toMatchObject({
      input: rssFeedUrl,
      status: 'source_created',
    })
    const request = await getRssFeedImportRequestForTest(user.id, result!.entity_id!)
    expect(request).toMatchObject({
      rss_feed_id: result?.entity_id,
      input_value: rssFeedUrl,
    })
    expect(request?.followed_at).toBeInstanceOf(Date)
    expect(await getRssFeedUrlForTest(result!.entity_id!)).toBe(rssFeedUrl)
  })

  it('imports a YouTube channel feed URL with a query parameter (regression: bulk import must not reject query params)', async () => {
    const channelId = `UC${randomUUID().replaceAll('-', '').slice(0, 22)}`
    const youtubeUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`
    const result = await importWithOwnedRow(user, youtubeUrl, {
      crawlerRssOptions: rssCrawlerOptions('YouTube Channel'),
    })

    expect(result).toMatchObject({ input: youtubeUrl, status: 'source_created' })
    expect(await getRssFeedUrlForTest(result.entity_id!)).toBe(youtubeUrl)
    expect(await getRssFeedTypeForTest(result.entity_id!)).toBe('video')
  })

  it('follows existing HTTPS feed when importing equivalent HTTP URL without calling createSourceFromUrl', async () => {
    const hostname = `http-https-dedup-${randomUUID()}.example.com`
    const rssFeed = await insertTestRssFeedDirect({ rssFeedUrl: `https://${hostname}/feed.xml` })

    const result = await importWithOwnedRow(user, `http://${hostname}/feed.xml`)

    expect(result).toMatchObject({
      input: `http://${hostname}/feed.xml`,
      status: 'followed',
      entity_id: rssFeed.id,
    })
  })

  it('casts one automatic topic vote across existing-feed import and repeated follows', async () => {
    const member = await createTestUser()
    const rssFeedUrl = `https://existing-vote-${randomUUID()}.example.com/feed.xml`
    const rssFeed = await insertTestRssFeedDirect({ rssFeedUrl })

    const imported = await importWithOwnedRow(member, rssFeedUrl, {
      follow: false,
    })
    expect(imported).toMatchObject({ status: 'imported', entity_id: rssFeed.id })
    expect(await getRssFeedFollowExistsForTest(member.id, rssFeed.id)).toBe(false)
    expect(await countTopicElectionVoteRowsForUser(member.id)).toBe(1)

    const followed = await importWithOwnedRow(member, rssFeedUrl)
    expect(followed).toMatchObject({ status: 'followed', entity_id: rssFeed.id })
    expect(await getRssFeedFollowExistsForTest(member.id, rssFeed.id)).toBe(true)

    const repeated = await importWithOwnedRow(member, rssFeedUrl)
    expect(repeated).toMatchObject({ status: 'already_following', entity_id: rssFeed.id })
    expect(await countTopicElectionVoteRowsForUser(member.id)).toBe(1)
  })

  it('uses the canonical feed for alias imports, votes, and follows', async () => {
    const member = await createTestUser()
    const aliasUrl = `https://alias-import-${randomUUID()}.example.com/feed.xml`
    const aliasTopic = await createTestTopic({ topic_type: 'rss_feed' })
    const canonicalTopic = await createTestTopic({ topic_type: 'rss_feed' })
    const alias = await insertTestRssFeedDirect({ rssFeedUrl: aliasUrl, topicId: aliasTopic.id })
    const canonical = await insertTestRssFeedDirect({ topicId: canonicalTopic.id })
    await setCanonicalRssFeed(alias.id, canonical.id)

    const imported = await importWithOwnedRow(member, aliasUrl, { follow: false })
    expect(imported).toMatchObject({ status: 'imported', entity_id: canonical.id })
    expect(await getRssFeedFollowExistsForTest(member.id, alias.id)).toBe(false)

    const followed = await importWithOwnedRow(member, aliasUrl)
    expect(followed).toMatchObject({ status: 'followed', entity_id: canonical.id })
    expect(await getRssFeedFollowExistsForTest(member.id, canonical.id)).toBe(true)
    expect(await getRssFeedFollowExistsForTest(member.id, alias.id)).toBe(false)
    expect(await countTopicElectionVoteRowsForUser(member.id)).toBe(1)
    expect(await getTopicElectionVoteEventCount(member.id, canonicalTopic.id)).toBe(1)
    expect(await getTopicElectionVoteEventCount(member.id, aliasTopic.id)).toBe(0)
  })

  it('rejects a newly blocked existing feed before voting or following', async () => {
    const member = await createTestUser()
    const hostname = `blocked-import-${randomUUID()}.example.com`
    const url = `https://${hostname}/feed.xml`
    const feed = await insertTestRssFeedDirect({ rssFeedUrl: url })
    await updateUrlHostnameBlocked(await getTestRssFeedUrlHostnameId(feed.id), true)

    await expect(importWithOwnedRow(member, url)).rejects.toMatchObject({
      status: 400,
    })
    expect(await getRssFeedFollowExistsForTest(member.id, feed.id)).toBe(false)
    expect(await countTopicElectionVoteRowsForUser(member.id)).toBe(0)
  })

  it('rejects a safe alias whose canonical feed URL is now blocked', async () => {
    const member = await createTestUser()
    const aliasUrl = `https://safe-alias-${randomUUID()}.example.com/feed.xml`
    const canonicalUrl = `https://blocked-canonical-${randomUUID()}.example.com/feed.xml`
    const alias = await insertTestRssFeedDirect({ rssFeedUrl: aliasUrl })
    const canonical = await insertTestRssFeedDirect({ rssFeedUrl: canonicalUrl })
    await setCanonicalRssFeed(alias.id, canonical.id)
    await updateUrlHostnameBlocked(await getTestRssFeedUrlHostnameId(canonical.id), true)

    await expect(importWithOwnedRow(member, aliasUrl)).rejects.toMatchObject({
      status: 400,
    })
    expect(await getRssFeedFollowExistsForTest(member.id, canonical.id)).toBe(false)
    expect(await countTopicElectionVoteRowsForUser(member.id)).toBe(0)
  })
})
