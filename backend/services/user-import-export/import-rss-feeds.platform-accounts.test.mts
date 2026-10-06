import { describe, expect, it, vi } from 'vitest'
import {
  countTopicElectionVoteRowsForUser,
  createTestUser,
  getRssFeedFollowExistsForTest,
  WEB_PROVENANCE,
} from '@voucha/test-helpers'
import {
  createPlatformAccountTestUser,
  type PlatformAccountTestKind,
} from '@voucha/test-helpers/account-types'
import * as automaticTopicUpvote from '@services/elections-votes/topic/automatic-upvote'
import { createSourceFromUrl } from '@services/rss-feeds/create-source'
import type { FeedClassification } from '@services/rss-feeds/validate'
import { importSingleRssFeed } from './import-rss-feeds.mts'

const KINDS: PlatformAccountTestKind[] = ['official', 'system', 'ai_agent']

function feedFixture(label: string) {
  const random = Math.random().toString(36).slice(2, 12)
  const fetchAndClassifyFeedImpl = vi.fn<(...args: any[]) => Promise<any>>(
    async (): Promise<FeedClassification> => ({
      kind: 'feed',
      title: `Import Platform Feed ${random}`,
      feedType: 'article',
    }),
  )
  // Real source creation, with only the feed fetch replaced by a classified feed.
  const createSourceFromUrlImpl: typeof createSourceFromUrl = (user, provenance, url, options) =>
    createSourceFromUrl(user, provenance, url, { ...options, fetchAndClassifyFeedImpl })
  return { feedUrl: `https://${label}-${random}.example.com/feed.xml`, createSourceFromUrlImpl }
}

async function withTrackedAutomaticUpvotes<T>(run: () => Promise<T>): Promise<T> {
  const upvote = automaticTopicUpvote.upsertAutomaticTopicUpvote
  const pending: Promise<unknown>[] = []
  const spy = vi
    .spyOn(automaticTopicUpvote, 'upsertAutomaticTopicUpvote')
    .mockImplementation((user, topicId) => {
      const result = upvote(user, topicId)
      pending.push(result)
      return result
    })
  try {
    return await run()
  } finally {
    await Promise.all(pending)
    spy.mockRestore()
  }
}

describe('importSingleRssFeed automatic vote for platform accounts', () => {
  it.each(KINDS)('creates and follows a new feed for a %s account without voting', async kind => {
    const account = await createPlatformAccountTestUser(kind)
    const { feedUrl, createSourceFromUrlImpl } = feedFixture('import-platform-new')

    const result = await importSingleRssFeed(account, WEB_PROVENANCE, feedUrl, {
      createSourceFromUrlImpl,
    })

    expect(result.status).toBe('source_created')
    expect(await getRssFeedFollowExistsForTest(account.id, result.entity_id!)).toBe(true)
    expect(await countTopicElectionVoteRowsForUser(account.id)).toBe(0)
  })

  it.each(KINDS)('follows an existing feed for a %s account without voting', async kind => {
    const member = await createTestUser()
    const account = await createPlatformAccountTestUser(kind)
    const { feedUrl, createSourceFromUrlImpl } = feedFixture('import-platform-existing')
    const created = await importSingleRssFeed(member, WEB_PROVENANCE, feedUrl, {
      createSourceFromUrlImpl,
    })

    const result = await importSingleRssFeed(account, WEB_PROVENANCE, feedUrl, {
      createSourceFromUrlImpl,
    })

    expect(result).toMatchObject({ status: 'followed', entity_id: created.entity_id })
    expect(await getRssFeedFollowExistsForTest(account.id, created.entity_id!)).toBe(true)
    expect(await countTopicElectionVoteRowsForUser(account.id)).toBe(0)
  })

  it('still casts the automatic +1 when a member imports a new feed', async () => {
    const member = await createTestUser()
    const { feedUrl, createSourceFromUrlImpl } = feedFixture('import-member-new')

    await withTrackedAutomaticUpvotes(() =>
      importSingleRssFeed(member, WEB_PROVENANCE, feedUrl, { createSourceFromUrlImpl }),
    )

    expect(await countTopicElectionVoteRowsForUser(member.id)).toBe(1)
  })
})
