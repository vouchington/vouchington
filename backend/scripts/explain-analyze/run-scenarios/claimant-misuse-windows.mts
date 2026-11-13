import assert from 'node:assert/strict'
import { beginTransaction } from '@data-stores/psql'
import { encodeScopedUuidCursor } from '@modules/pagination'
import { getPendingCopyrightStaffCases } from '@services/copyright-notices/read-models-staff-case'
import { readClaimantMisuseSummaryPage } from '@services/copyright-notices/claimant-misuse-summary'
import { verifyCopyrightCaseChildPage } from '@services/copyright-notices/retention-case-purge-children'
import { COPYRIGHT_CASE_PURGE_PHASES } from '@data-stores/psql/copyright-case-purge-order'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'
import {
  CLAIMANT_MISUSE_CASE_IDS,
  CLAIMANT_MISUSE_DENSE_NOTICE_ID,
  CLAIMANT_MISUSE_EVENT_COUNT,
  CLAIMANT_MISUSE_NOTICE_COUNT,
  CLAIMANT_MISUSE_NEAR_OLDEST_CURSOR_ID,
  CLAIMANT_MISUSE_USER_IDS,
  seedClaimantMisuseWindows,
} from '../seed-data/claimant-misuse-windows.mts'

/** Every case's claimant owns a full window, even beside a claimant with a much larger history. */
export async function runClaimantMisuseWindowScenarios(): Promise<void> {
  await seedClaimantMisuseWindows()
  registerWindow('copyright-claimant-misuse-case-page')
  await runAndCapture(
    'copyright-claimant-misuse-case-page',
    async () => {
      await using query = await beginTransaction()
      const cases = await getPendingCopyrightStaffCases(CLAIMANT_MISUSE_CASE_IDS, query)
      assert.equal(cases.size, 3)
      const summaries = CLAIMANT_MISUSE_CASE_IDS.map(id => cases.get(id)!.claimant.misuse!)
      assert.deepEqual(
        summaries.map(summary => summary.notice_count),
        [1000, 25, 25],
      )
      assert.deepEqual(
        summaries.map(summary => summary.notice_withdrawn),
        [500, 13, 12],
      )
      assert.equal(summaries[0]!.page_info.has_next_page, true)
      assert.equal(summaries[1]!.page_info.has_next_page, false)
      await query.rollback()
    },
    undefined,
    'readClaimantMisuseSummaries',
  )
  const first = await readClaimantMisuseSummaryPage(CLAIMANT_MISUSE_USER_IDS[0]!)
  assert.ok(first.page_info.end_cursor)
  registerWindow('copyright-claimant-misuse-older-window', true)
  await runAndCapture(
    'copyright-claimant-misuse-older-window',
    async () => {
      const older = await readClaimantMisuseSummaryPage(
        CLAIMANT_MISUSE_USER_IDS[0]!,
        first.page_info.end_cursor!,
      )
      assert.equal(older.notice_count, 1000)
      assert.equal(older.notice_withdrawn, 500)
      assert.equal(older.page_info.has_next_page, true)
      assert.notEqual(older.page_info.start_cursor, first.page_info.start_cursor)
    },
    undefined,
    'readClaimantMisuseSummaries',
  )
  const claimantUserId = CLAIMANT_MISUSE_USER_IDS[0]!
  const nearOldestCursor = encodeScopedUuidCursor(
    CLAIMANT_MISUSE_NEAR_OLDEST_CURSOR_ID,
    `copyright-claimant-misuse:${claimantUserId}`,
  )
  registerScenarioContract('copyright-claimant-misuse-near-oldest-window', {
    expectations: [
      { kind: 'usesIndexes', indexes: ['idx_copyright_notices__claimant_user'] },
      // Up to one candidate and one receipt lookup per selected notice.
      { kind: 'maxProcessedRows', relation: 'copyright_notices', max: 2200 },
      { kind: 'custom', name: 'claimantMisuseCursorSeek' },
    ],
    seededRows: {
      copyright_notices: CLAIMANT_MISUSE_NOTICE_COUNT + 1000,
      copyright_claimant_misuse_events: CLAIMANT_MISUSE_EVENT_COUNT,
    },
  })
  await runAndCapture(
    'copyright-claimant-misuse-near-oldest-window',
    async () => {
      const oldestWindow = await readClaimantMisuseSummaryPage(claimantUserId, nearOldestCursor)
      assert.equal(oldestWindow.notice_count, 1000)
      assert.equal(oldestWindow.notice_withdrawn, 500)
      assert.equal(oldestWindow.page_info.has_next_page, false)
    },
    undefined,
    'readClaimantMisuseSummaries',
  )
  await runOrderedPurgeProbe()
}

async function runOrderedPurgeProbe(): Promise<void> {
  registerScenarioContract('copyright-claimant-misuse-purge-page', {
    expectations: [
      { kind: 'usesIndexes', indexes: ['idx_copyright_claimant_misuse_events__notice'] },
      { kind: 'maxProcessedRows', relation: 'copyright_claimant_misuse_events', max: 65 },
    ],
    seededRows: { copyright_claimant_misuse_events: CLAIMANT_MISUSE_EVENT_COUNT },
  })
  await runAndCapture(
    'copyright-claimant-misuse-purge-page',
    async () => {
      await using query = await beginTransaction()
      const phase = COPYRIGHT_CASE_PURGE_PHASES.findIndex(
        item => item[0] === 'copyright_claimant_misuse_events',
      )
      assert.ok(phase >= 0)
      const result = await verifyCopyrightCaseChildPage(
        query,
        CLAIMANT_MISUSE_DENSE_NOTICE_ID,
        phase,
        undefined,
        25,
      )
      assert.equal(result.processed, 25)
      assert.equal(result.blocked, false)
      await query.rollback()
    },
    undefined,
    'verifyCopyrightCaseChildPage',
  )
}

function registerWindow(id: string, cursor = false): void {
  registerScenarioContract(id, {
    expectations: [
      {
        kind: 'usesIndexes',
        indexes: [
          'idx_copyright_notices__claimant_user',
          'idx_copyright_claimant_misuse_events__notice_outcome',
        ],
      },
      // 1,051 candidates plus 1,050 bounded receipt lookups; add ~20% headroom.
      { kind: 'maxProcessedRows', relation: 'copyright_notices', max: 2500 },
      { kind: 'maxProcessedRows', relation: 'copyright_claimant_misuse_events', max: 650 },
      ...(cursor ? [{ kind: 'custom' as const, name: 'claimantMisuseCursorSeek' }] : []),
    ],
    seededRows: {
      copyright_notices: CLAIMANT_MISUSE_NOTICE_COUNT + 1000,
      copyright_claimant_misuse_events: CLAIMANT_MISUSE_EVENT_COUNT,
    },
  })
}
