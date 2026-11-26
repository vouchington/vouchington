import assert from 'node:assert/strict'
import { write } from '@data-stores/psql'
import { getReferralClickLog } from '@services/attribution/click-log'
import { getMembershipHistory } from '@services/memberships/history'
import { getUserReferralLinks } from '@services/user-referral-program-links/get'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture, seedUser } from '../run-support.mts'
import {
  deleteAccountReferralFixture,
  seedAccountMembershipHistory,
  seedAccountReferralFixture,
} from './account-history-fixtures.mts'

const LIMIT = 100

type Page = {
  results: readonly { id: string }[]
  page_info: { has_next_page: boolean; end_cursor: string | null }
}

function captureHistoryPages(
  scenario: string,
  name: string,
  expected: readonly string[],
  read: (after?: string) => Promise<Page>,
): Promise<void> {
  return runAndCapture(
    scenario,
    async () => {
      const first = await read()
      assert.ok(expected.length > LIMIT && expected.length < LIMIT * 2)
      assert.deepEqual(
        first.results.map(row => row.id),
        expected.slice(0, LIMIT),
      )
      assert.equal(first.page_info.has_next_page, true)
      assert.ok(first.page_info.end_cursor)
      const second = await read(first.page_info.end_cursor)
      assert.deepEqual(
        second.results.map(row => row.id),
        expected.slice(LIMIT),
      )
      assert.equal(second.page_info.has_next_page, false)
    },
    undefined,
    name,
    { exactCapturedNames: [name, name] },
  )
}

export async function runAccountHistoryScenarios(): Promise<void> {
  const history = await seedAccountMembershipHistory()
  await write(
    '/* analyzeAccountMembershipHistory */ ANALYZE membership_changes, membership_products',
  )
  registerScenarioContract('account-membership-history-at-cap', {
    expectations: [
      { kind: 'noSeqScan', relation: 'membership_changes' },
      { kind: 'maxProcessedRows', relation: 'membership_changes', max: LIMIT + 1 },
    ],
  })
  await captureHistoryPages(
    'account-membership-history-at-cap',
    'getMembershipHistory',
    history.ids,
    after => getMembershipHistory(history.ownerId, { limit: LIMIT, after }),
  )

  const fixture = await seedAccountReferralFixture()
  try {
    await write(
      '/* analyzeAccountReferralFixture */ ANALYZE user_referral_program_links, session_referral_attributions',
    )
    registerScenarioContract('account-referral-links-at-cap', {
      expectations: [
        { kind: 'noSeqScan', relation: 'user_referral_program_links' },
        // Hosted custom continuation walks the global index. https://github.com/vouchington/vouchington/issues/6405
        { kind: 'maxProcessedRows', relation: 'user_referral_program_links', max: 40_668 },
      ],
    })
    const owner = { ...seedUser, id: fixture.ownerId }
    await captureHistoryPages(
      'account-referral-links-at-cap',
      'getUserReferralLinks',
      fixture.ownerLinkIds,
      after => getUserReferralLinks(owner, fixture.ownerId, { limit: LIMIT, after }),
    )
    registerScenarioContract('account-referral-clicks-at-cap', {
      expectations: [
        { kind: 'noSeqScan', relation: 'session_referral_attributions' },
        // Generic walks other referrers' clicks in the live leaf. https://github.com/vouchington/vouchington/issues/6406
        { kind: 'maxProcessedRows', relation: 'session_referral_attributions', max: 4_901 },
      ],
      crossPartition: {
        session_referral_attributions:
          'Account click history spans retained partitions after account creation.',
      },
    })
    await captureHistoryPages(
      'account-referral-clicks-at-cap',
      'getReferralClickLog',
      fixture.ownerClickIds,
      after => getReferralClickLog(fixture.ownerId, { limit: LIMIT, after }),
    )
  } finally {
    await deleteAccountReferralFixture(fixture)
  }
}
