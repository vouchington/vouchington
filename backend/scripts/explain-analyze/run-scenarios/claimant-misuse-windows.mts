import assert from 'node:assert/strict'
import { beginTransaction } from '@data-stores/psql'
import { getPendingCopyrightStaffCases } from '@services/copyright-notices/read-models-staff-case'
import { readClaimantMisuseSummaryPage } from '@services/copyright-notices/claimant-misuse-summary'
import { verifyCopyrightCaseChildPage } from '@services/copyright-notices/retention-case-purge-children'
import { COPYRIGHT_CASE_PURGE_PHASES } from '@services/copyright-notices/retention-case-purge-order'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'
import {
  CLAIMANT_MISUSE_CASE_IDS,
  CLAIMANT_MISUSE_DENSE_NOTICE_ID,
  CLAIMANT_MISUSE_EVENT_COUNT,
  CLAIMANT_MISUSE_NOTICE_COUNT,
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
  registerWindow('copyright-claimant-misuse-older-window')
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

function registerWindow(id: string): void {
  registerScenarioContract(id, {
    expectations: [
      {
        kind: 'usesIndexes',
        indexes: [
          'idx_copyright_notices__claimant_user',
          'idx_copyright_claimant_misuse_events__notice_outcome',
        ],
      },
      // Both modes read 1,051 notices and 525 event hits for three claimants; add ~20% headroom.
      { kind: 'maxProcessedRows', relation: 'copyright_notices', max: 1300 },
      { kind: 'maxProcessedRows', relation: 'copyright_claimant_misuse_events', max: 650 },
    ],
    seededRows: {
      copyright_notices: CLAIMANT_MISUSE_NOTICE_COUNT + 1000,
      copyright_claimant_misuse_events: CLAIMANT_MISUSE_EVENT_COUNT,
    },
  })
}
