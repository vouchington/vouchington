import assert from 'node:assert/strict'
import { beginTransaction } from '@data-stores/psql'
import { selectBlockedCopyrightRestoreIntentIds } from '@services/copyright-notices/court-hold-restore-replay'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'
import { seedCopyrightRestoreIntents } from '../seed-data/copyright-restore-intents.mts'

const pageSize = 100
const scenario = 'copyright-blocked-restore-intents-at-cap'
const operation = 'selectBlockedCopyrightRestoreIntentIds'

export async function runCopyrightRestoreIntentCapacityScenario(): Promise<void> {
  const fixture = await seedCopyrightRestoreIntents()
  try {
    registerScenarioContract(scenario, {
      seededRows: {
        copyright_notice_action_work_items: fixture.intentCount,
        copyright_notice_targets: fixture.targetCount,
        copyright_restrictions: fixture.targetCount,
      },
      expectations: [
        { kind: 'queryBinds', token: 'LIMIT' },
        // Main's generic plan walks the global ID order. Tighten after #6586.
        { kind: 'maxProcessedRows', relation: 'copyright_notice_action_work_items', max: 4_167 },
        { kind: 'maxProcessedRows', relation: 'copyright_notice_targets', max: 2_600 },
        { kind: 'maxInputRows', nodeType: 'Sort', max: 120 },
      ],
    })
    await runAndCapture(
      scenario,
      async () => {
        await using transaction = await beginTransaction()
        assert.equal(fixture.eligibleIds.length, 120)
        assert.deepEqual(
          await selectBlockedCopyrightRestoreIntentIds(fixture.noticeId, transaction),
          fixture.eligibleIds.slice(0, pageSize),
        )
      },
      undefined,
      operation,
      { exactCapturedNames: [operation] },
    )
  } finally {
    await fixture.cleanup()
  }
}
