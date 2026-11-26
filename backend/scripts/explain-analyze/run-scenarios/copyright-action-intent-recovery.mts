import assert from 'node:assert/strict'
import { encodeCursor } from '@modules/pagination'
import { searchRecoverableCopyrightActionIntentIds } from '@services/copyright-notices/action-delivery-state'
import { getCopyrightSweepLimits } from '@services/copyright-notices/work-limits'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'
import { seedCopyrightActionIntentRecovery } from '../seed-data/copyright-action-intent-recovery.mts'

const operation = 'searchRecoverableCopyrightActionIntentIds'
const pageSize = 100

export async function runCopyrightActionIntentRecoveryCapacityScenarios(): Promise<void> {
  const { batchSize } = getCopyrightSweepLimits('actions')
  assert.equal(batchSize, pageSize)
  const fixture = await seedCopyrightActionIntentRecovery()
  try {
    assert.equal(fixture.eligibleIds.length, 240)
    let after: string | undefined
    for (const [index, suffix] of ['first', 'continuation'].entries()) {
      const scenario = `copyright-action-intent-recovery-${suffix}`
      const ids = fixture.eligibleIds.slice(index * pageSize, (index + 1) * pageSize)
      registerScenarioContract(scenario, {
        seededRows: {
          copyright_notice_action_work_items: fixture.intentCount,
          copyright_notice_targets: fixture.targetCount,
          copyright_restrictions: fixture.targetCount,
          copyright_notice_submissions: fixture.caseCount,
        },
        expectations: [
          { kind: 'queryBinds', token: 'LIMIT' },
          {
            kind: 'maxProcessedRows',
            relation: 'copyright_notice_action_work_items',
            max: index === 0 ? 201 : 203,
          },
          { kind: 'maxInputRows', nodeType: 'Sort', max: 0 },
        ],
      })
      const cursor: { after?: string; next?: string } = { after }
      await runAndCapture(
        scenario,
        async () => {
          const page = await searchRecoverableCopyrightActionIntentIds({
            now: fixture.evaluatedAt,
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
