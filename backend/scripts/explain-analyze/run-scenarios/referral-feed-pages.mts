import assert from 'node:assert/strict'
import { encodeCursor } from '@modules/pagination'
import { getReferralLinksFeed } from '@services/feeds/referral-links/get'
import { registerScenarioContract } from '../plan-expectations.mts'
import { heavyFollowUser, runAndCapture } from '../run-support.mts'
import {
  cleanupReferralFeedPages,
  seedReferralFeedPages,
  referralFeedPageId,
  REFERRAL_FEED_PAGE_START,
} from '../seed-data/referral-feed-pages.mts'

/** Empty application pages still execute bounded raw-ID reads and carry their inspected tail. */
export async function runReferralFeedPageScenarios(): Promise<void> {
  await seedReferralFeedPages()
  try {
    const cases = [
      {
        id: 'referral-feed-inspected-short',
        limit: 2,
        after: REFERRAL_FEED_PAGE_START,
        matches: [0],
        tail: 19,
      },
      {
        id: 'referral-feed-inspected-empty',
        limit: 1,
        after: referralFeedPageId(0),
        matches: [],
        tail: 10,
      },
      {
        id: 'referral-feed-inspected-after',
        limit: 1,
        after: referralFeedPageId(39),
        matches: [40],
        tail: 40,
      },
      {
        id: 'referral-feed-inspected-limit100',
        limit: 100,
        after: REFERRAL_FEED_PAGE_START,
        matches: [0, 40],
        tail: 999,
      },
      {
        id: 'referral-feed-inspected-terminal',
        limit: 1,
        after: referralFeedPageId(1000),
        matches: [],
        tail: null,
      },
    ] as const
    for (const scenario of cases) {
      registerScenarioContract(scenario.id, {
        ...(scenario.tail === null ? { allowEmptyResult: true } : {}),
        expectations: [{ kind: 'custom', name: 'referralFeedInspectedWalk' }],
      })
      await runAndCapture(scenario.id, async () => {
        const page = await getReferralLinksFeed(heavyFollowUser, 'follow_users', {
          limit: scenario.limit,
          after: encodeCursor({ id: scenario.after }),
        })
        assert.deepEqual(
          page.results.map(row => row.id),
          scenario.matches.map(referralFeedPageId),
        )
        assert.equal(page.page_info.has_next_page, scenario.tail !== null)
        assert.equal(
          page.page_info.end_cursor,
          scenario.tail === null ? null : encodeCursor({ id: referralFeedPageId(scenario.tail) }),
        )
      })
    }
  } finally {
    await cleanupReferralFeedPages()
  }
}
