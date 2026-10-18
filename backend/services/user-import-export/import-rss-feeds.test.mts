import { randomUUID } from 'node:crypto'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import {
  countTopicElectionVoteRowsForUser,
  createTestTopic,
  createTestUser,
  getRssFeedFollowExistsForTest,
  getRssFeedImportRequestForTest,
  getTestRssFeedUrlHostnameId,
  getTopicElectionVoteEventCount,
  insertTestRssFeedDirect,
  updateUrlHostnameBlocked,
  WEB_PROVENANCE,
} from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'
import { setCanonicalRssFeed } from '@services/rss-feeds/set-canonical'
import { importSingleRssFeed } from './import-rss-feeds.mts'

describe('importSingleRssFeed', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
  })

  it('records followed imports for newly created sources', async () => {
    const rssFeedUrl = `https://new-source-import-${Date.now()}.example.com/feed.xml`
    const rssFeed = await insertTestRssFeedDirect({})
    const createSourceFromUrlImpl = vi.fn<(...args: any[]) => Promise<any>>().mockResolvedValue({
      status: 'created',
      topic_slug: 'new-source-import',
      topic_id: randomUUID(),
      rss_feed_id: rssFeed.id,
    })

    const result = await importSingleRssFeed(user, WEB_PROVENANCE, rssFeedUrl, {
      createSourceFromUrlImpl,
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
  })

  it('imports a YouTube channel feed URL with a query parameter (regression: bulk import must not reject query params)', async () => {
    const youtubeUrl =
      'https://www.youtube.com/feeds/videos.xml?channel_id=UC4w1YQAJMWOz4qtxinq55LQ'
    const rssFeed = await insertTestRssFeedDirect({})
    const createSourceFromUrlImpl = vi.fn<(...args: any[]) => Promise<any>>().mockResolvedValue({
      status: 'created',
      topic_slug: 'youtube-channel',
      topic_id: randomUUID(),
      rss_feed_id: rssFeed.id,
    })

    const result = await importSingleRssFeed(user, WEB_PROVENANCE, youtubeUrl, {
      createSourceFromUrlImpl,
    })

    expect(result).toMatchObject({ input: youtubeUrl, status: 'source_created' })
    expect(createSourceFromUrlImpl).toHaveBeenCalledWith(
      expect.objectContaining({ id: user.id }),
      WEB_PROVENANCE,
      youtubeUrl,
      expect.any(Object),
    )
  })

  it('follows existing HTTPS feed when importing equivalent HTTP URL without calling createSourceFromUrl', async () => {
    const hostname = `http-https-dedup-${Date.now()}.example.com`
    const rssFeed = await insertTestRssFeedDirect({ rssFeedUrl: `https://${hostname}/feed.xml` })

    const result = await importSingleRssFeed(user, WEB_PROVENANCE, `http://${hostname}/feed.xml`)

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

    const imported = await importSingleRssFeed(member, WEB_PROVENANCE, rssFeedUrl, {
      follow: false,
    })
    expect(imported).toMatchObject({ status: 'imported', entity_id: rssFeed.id })
    expect(await getRssFeedFollowExistsForTest(member.id, rssFeed.id)).toBe(false)
    expect(await countTopicElectionVoteRowsForUser(member.id)).toBe(1)

    const followed = await importSingleRssFeed(member, WEB_PROVENANCE, rssFeedUrl)
    expect(followed).toMatchObject({ status: 'followed', entity_id: rssFeed.id })
    expect(await getRssFeedFollowExistsForTest(member.id, rssFeed.id)).toBe(true)

    const repeated = await importSingleRssFeed(member, WEB_PROVENANCE, rssFeedUrl)
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

    const imported = await importSingleRssFeed(member, WEB_PROVENANCE, aliasUrl, { follow: false })
    expect(imported).toMatchObject({ status: 'imported', entity_id: canonical.id })
    expect(await getRssFeedFollowExistsForTest(member.id, alias.id)).toBe(false)

    const followed = await importSingleRssFeed(member, WEB_PROVENANCE, aliasUrl)
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

    await expect(importSingleRssFeed(member, WEB_PROVENANCE, url)).rejects.toMatchObject({
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

    await expect(importSingleRssFeed(member, WEB_PROVENANCE, aliasUrl)).rejects.toMatchObject({
      status: 400,
    })
    expect(await getRssFeedFollowExistsForTest(member.id, canonical.id)).toBe(false)
    expect(await countTopicElectionVoteRowsForUser(member.id)).toBe(0)
  })
})
