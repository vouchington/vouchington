import { expect } from 'vitest'
import { sweepUnlinkedCopyrightEmailIntakes } from '../services/copyright-notices/operational-retention-email-intakes.mts'
import { readCopyrightIntakeRetentionState } from './copyright-email-retention-state.mts'
import { readCopyrightUnlinkedEmailOperationalCursor } from './copyright-unlinked-email-cursor.mts'

/** Drive bounded scheduled ticks until the owned intake's page commits. */
export async function sweepCopyrightUnlinkedEmailUntilCommitted(
  intakeId: string,
  options: Omit<Parameters<typeof sweepUnlinkedCopyrightEmailIntakes>[0], 'maxBatches'> & {
    maxTicks: number
  },
): Promise<void> {
  // Each attempted tick is one real bounded page; aborted ticks consume this finite budget.
  for (let tick = 0; tick < options.maxTicks; tick += 1) {
    const before = await readCopyrightUnlinkedEmailOperationalCursor()
    const result = await sweepUnlinkedCopyrightEmailIntakes({
      now: options.now,
      retentionDays: options.retentionDays,
      childLimit: options.childLimit,
      maxBatches: 1,
      queryAfterStorage: options.queryAfterStorage,
    })
    const after = await readCopyrightUnlinkedEmailOperationalCursor()
    if (result.scanned === 0) {
      expect(result).toEqual({ scanned: 0, erased: 0, hasMore: false })
      expect(after).toEqual(before)
      expect(await readCopyrightIntakeRetentionState(intakeId)).toMatchObject({
        intakeExists: true,
        receiptExists: true,
      })
      continue
    }
    expect([
      { scanned: 1, erased: 0, hasMore: true },
      { scanned: 1, erased: 1, hasMore: true },
    ]).toContainEqual(result)
    if (after.cursor_record_id === intakeId) return
  }
  throw new Error(
    `Unlinked copyright email intake ${intakeId} did not complete in ${options.maxTicks} ticks`,
  )
}
