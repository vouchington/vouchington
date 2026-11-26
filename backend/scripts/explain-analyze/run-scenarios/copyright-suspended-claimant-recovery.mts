import assert from 'node:assert/strict'
import { encodeCursor } from '@modules/pagination'
import { searchSuspendedClaimantAutomaticRestrictionNoticeIds } from '@services/copyright-notices/claimant-suspension-lifts'
import { getCopyrightSweepLimits } from '@services/copyright-notices/work-limits'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'
import { seedCopyrightSuspendedClaimantRecovery } from '../seed-data/copyright-suspended-claimant-recovery.mts'

const operation = 'searchSuspendedClaimantAutomaticRestrictionNoticeIds'

export async function runCopyrightSuspendedClaimantRecoveryCapacityScenarios(): Promise<void> {
  const { batchSize } = getCopyrightSweepLimits('suspended')
  assert.equal(batchSize, 100)
  const fixture = await seedCopyrightSuspendedClaimantRecovery()
  try {
    assert.equal(fixture.eligibleIds.length, 250)
    let after: string | undefined
    for (const [index, suffix] of ['first', 'continuation'].entries()) {
      const scenario = `copyright-suspended-claimant-recovery-${suffix}`
      const ids = fixture.eligibleIds.slice(index * batchSize, (index + 1) * batchSize)
      registerScenarioContract(scenario, {
        seededRows: fixture.seededRows,
        expectations: [
          { kind: 'queryBinds', token: 'LIMIT' },
          // This query scans the full target set in both modes.
          // Follow-up in https://github.com/vouchington/vouchington/issues/6374#issuecomment-7189051625
          { kind: 'maxProcessedRows', relation: 'copyright_notice_targets', max: 1501 },
          { kind: 'maxProcessedRows', relation: 'copyright_restrictions', max: 1250 },
          { kind: 'maxInputRows', nodeType: 'Sort', max: index === 0 ? 500 : 300 },
        ],
      })
      const cursor: { after?: string; next?: string } = { after }
      await runAndCapture(
        scenario,
        async () => {
          const page = await searchSuspendedClaimantAutomaticRestrictionNoticeIds({
            limit: batchSize,
            after: cursor.after,
          })
          assert.deepEqual(page, {
            results: ids,
            page_info: {
              has_next_page: true,
              start_cursor: encodeCursor({ id: ids[0]! }),
              end_cursor: encodeCursor({ id: ids.at(-1)! }),
            },
          })
          cursor.next = page.page_info.end_cursor!
        },
        suffix,
        operation,
        { exactCapturedNames: [operation] },
      )
      assert.ok(cursor.next)
      after = cursor.next
    }
  } finally {
    await fixture.cleanup()
  }
}
