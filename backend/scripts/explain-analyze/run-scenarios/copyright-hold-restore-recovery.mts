import assert from 'node:assert/strict'
import { encodeCursor } from '@modules/pagination'
import { searchBlockedCopyrightHoldRestorationIntentIds } from '@services/copyright-notices/hold-restoration-recovery'
import { getCopyrightSweepLimits } from '@services/copyright-notices/work-limits'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'
import { seedCopyrightHoldRestoreRecovery } from '../seed-data/copyright-hold-restore-recovery.mts'

const operation = 'searchBlockedCopyrightHoldRestorationIntentIds'
const pageSize = 100

export async function runCopyrightHoldRestoreRecoveryCapacityScenarios(): Promise<void> {
  const { batchSize } = getCopyrightSweepLimits('blocked')
  assert.equal(batchSize, pageSize)
  const fixture = await seedCopyrightHoldRestoreRecovery()
  try {
    assert.equal(fixture.eligibleIds.length, 240)
    let after: string | undefined
    for (const [index, suffix] of ['first', 'continuation'].entries()) {
      const scenario = `copyright-hold-restore-recovery-${suffix}`
      const ids = fixture.eligibleIds.slice(index * pageSize, (index + 1) * pageSize)
      registerScenarioContract(scenario, {
        seededRows: {
          copyright_notice_action_work_items: fixture.intentCount,
          copyright_notice_targets: fixture.targetCount,
          copyright_restrictions: fixture.targetCount,
          copyright_notice_submissions: fixture.caseCount,
          copyright_notice_legal_hold_assessments: fixture.assessedCases,
        },
        expectations: [
          { kind: 'queryBinds', token: 'LIMIT' },
          {
            kind: 'maxProcessedRows',
            relation: 'copyright_notice_action_work_items',
            max: index === 0 ? 320 : 300,
          },
          { kind: 'maxInputRows', nodeType: 'Sort', max: index === 0 ? 240 : 140 },
        ],
      })
      const cursor: { after?: string; next?: string } = { after }
      await runAndCapture(
        scenario,
        async () => {
          const page = await searchBlockedCopyrightHoldRestorationIntentIds({
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
