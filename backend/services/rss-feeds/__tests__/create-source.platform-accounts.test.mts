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
import type { FeedClassification } from '../validate.mts'
import * as automaticTopicUpvote from '@services/elections-votes/topic/automatic-upvote'
import { createSourceFromUrl } from '../create-source.mts'

const KINDS: PlatformAccountTestKind[] = ['official', 'system', 'ai_agent']

function feedFixture(label: string) {
  const random = Math.random().toString(36).slice(2, 12)
  const host = `${label}-${random}.example.com`
  const fetchAndClassifyFeedImpl = vi.fn<(...args: any[]) => Promise<any>>(
    async (): Promise<FeedClassification> => ({
      kind: 'feed',
      title: `Platform Account Feed ${random}`,
      feedType: 'article',
    }),
  )
  return { httpsUrl: `https://${host}/feed.xml`, host, fetchAndClassifyFeedImpl }
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
    const result = await run()
    await Promise.all(pending)
    return result
  } finally {
    spy.mockRestore()
  }
}

describe('create-source automatic vote for platform accounts', () => {
  it.each(KINDS)('creates and follows the feed for a %s account without voting', async kind => {
    const account = await createPlatformAccountTestUser(kind)
    const { httpsUrl, fetchAndClassifyFeedImpl } = feedFixture('platform-new')

    const result = await createSourceFromUrl(account, WEB_PROVENANCE, httpsUrl, {
      fetchAndClassifyFeedImpl,
    })

    expect(result.status).toBe('created')
    expect(await getRssFeedFollowExistsForTest(account.id, result.rss_feed_id)).toBe(true)
    expect(await countTopicElectionVoteRowsForUser(account.id)).toBe(0)
  })

  it.each(KINDS)('follows an existing feed for a %s account without voting', async kind => {
    const member = await createTestUser()
    const account = await createPlatformAccountTestUser(kind)
    const { httpsUrl, fetchAndClassifyFeedImpl } = feedFixture('platform-existing')
    const first = await createSourceFromUrl(member, WEB_PROVENANCE, httpsUrl, {
      fetchAndClassifyFeedImpl,
    })

    const second = await createSourceFromUrl(account, WEB_PROVENANCE, httpsUrl, {
      fetchAndClassifyFeedImpl,
    })

    expect(second).toMatchObject({ status: 'upvoted', rss_feed_id: first.rss_feed_id })
    expect(await getRssFeedFollowExistsForTest(account.id, first.rss_feed_id)).toBe(true)
    expect(await countTopicElectionVoteRowsForUser(account.id)).toBe(0)
  })

  it.each(KINDS)(
    'follows an existing https feed for an http %s submission without voting',
    async kind => {
      const member = await createTestUser()
      const account = await createPlatformAccountTestUser(kind)
      const { httpsUrl, fetchAndClassifyFeedImpl } = feedFixture('platform-http')
      const first = await createSourceFromUrl(member, WEB_PROVENANCE, httpsUrl, {
        fetchAndClassifyFeedImpl,
      })

      const second = await createSourceFromUrl(
        account,
        WEB_PROVENANCE,
        httpsUrl.replace('https://', 'http://'),
        { fetchAndClassifyFeedImpl },
      )

      expect(second).toMatchObject({ status: 'upvoted', rss_feed_id: first.rss_feed_id })
      expect(await getRssFeedFollowExistsForTest(account.id, first.rss_feed_id)).toBe(true)
      expect(await countTopicElectionVoteRowsForUser(account.id)).toBe(0)
    },
  )

  it('writes no vote for a platform account racing a member to create the same feed', async () => {
    const member = await createTestUser()
    const account = await createPlatformAccountTestUser('official')
    const { httpsUrl, fetchAndClassifyFeedImpl } = feedFixture('platform-race')

    const [fromAccount, fromMember] = await withTrackedAutomaticUpvotes(() =>
      Promise.all([
        createSourceFromUrl(account, WEB_PROVENANCE, httpsUrl, { fetchAndClassifyFeedImpl }),
        createSourceFromUrl(member, WEB_PROVENANCE, httpsUrl, { fetchAndClassifyFeedImpl }),
      ]),
    )

    expect(fromAccount.rss_feed_id).toBe(fromMember.rss_feed_id)
    expect(await getRssFeedFollowExistsForTest(account.id, fromAccount.rss_feed_id)).toBe(true)
    expect(await countTopicElectionVoteRowsForUser(account.id)).toBe(0)
    expect(await countTopicElectionVoteRowsForUser(member.id)).toBe(1)
  })

  it('still casts the automatic +1 for a member on a new feed and on an existing one', async () => {
    const creator = await createTestUser()
    const joiner = await createTestUser()
    const { httpsUrl, fetchAndClassifyFeedImpl } = feedFixture('member-vote')

    await withTrackedAutomaticUpvotes(async () => {
      await createSourceFromUrl(creator, WEB_PROVENANCE, httpsUrl, { fetchAndClassifyFeedImpl })
      await createSourceFromUrl(joiner, WEB_PROVENANCE, httpsUrl, { fetchAndClassifyFeedImpl })
    })

    expect(await countTopicElectionVoteRowsForUser(creator.id)).toBe(1)
    expect(await countTopicElectionVoteRowsForUser(joiner.id)).toBe(1)
  })
})
