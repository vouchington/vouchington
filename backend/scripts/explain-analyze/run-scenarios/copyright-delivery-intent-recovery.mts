import assert from 'node:assert/strict'
import { encodeCursor } from '@modules/pagination'
import { searchRecoverableCopyrightDeliveryIntentIds } from '@services/copyright-notices/delivery-intent-recovery'
import { getCopyrightSweepLimits } from '@services/copyright-notices/work-limits'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'
import { seedCopyrightDeliveryIntentRecovery } from '../seed-data/copyright-delivery-intent-recovery.mts'

const operation = 'searchRecoverableCopyrightDeliveryIntentIds'
const pageSize = 100

export async function runCopyrightDeliveryIntentRecoveryCapacityScenarios(): Promise<void> {
  const { batchSize } = getCopyrightSweepLimits()
  assert.equal(batchSize, pageSize)
  const fixture = await seedCopyrightDeliveryIntentRecovery()
  try {
    for (const channel of ['email', 'in_app'] as const) {
      const eligibleIds = fixture.eligibleIds[channel]
      assert.equal(eligibleIds.length, 240)
      let after: string | undefined
      for (const [index, suffix] of ['first', 'continuation'].entries()) {
        const scenario = `copyright-delivery-intent-recovery-${channel.replace('_', '-')}-${suffix}`
        const ids = eligibleIds.slice(index * pageSize, (index + 1) * pageSize)
        registerScenarioContract(scenario, {
          seededRows: { copyright_notice_delivery_work_items: fixture.intentCount },
          expectations: [
            { kind: 'queryBinds', token: 'LIMIT' },
            // Both modes can choose the primary key and filter other channels and states.
            // Follow-up in https://github.com/vouchington/vouchington/issues/6374#issuecomment-7189051625
            {
              kind: 'maxProcessedRows',
              relation: 'copyright_notice_delivery_work_items',
              max: index === 0 ? 502 : 508,
            },
            {
              kind: 'usesIndexes',
              indexes: [
                'idx_copyright_notice_delivery_work_items__recoverable',
                'copyright_notice_delivery_work_items_pkey',
              ],
              anyOf: true,
              noSort: true,
            },
          ],
        })
        const cursor: { after?: string; next?: string } = { after }
        await runAndCapture(
          scenario,
          async () => {
            const page = await searchRecoverableCopyrightDeliveryIntentIds({
              channel,
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
          `${channel} ${suffix}`,
          operation,
          { exactCapturedNames: [operation] },
        )
        assert.ok(cursor.next)
        after = cursor.next
      }
    }
  } finally {
    await fixture.cleanup()
  }
}
