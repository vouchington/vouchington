import { expect } from 'vitest'
import { readCopyrightThreadOperationalCursor } from './copyright-operational-retention.mts'
import { readCopyrightThreadReferenceState } from './copyright-operational-email-retention.mts'
import { readCopyrightIntakeRetentionState } from './copyright-email-retention-state.mts'
import { readCopyrightThreadRetirementBound } from './copyright-thread-retention.mts'

type References = Awaited<ReturnType<typeof readCopyrightThreadReferenceState>>
type Cursor = Awaited<ReturnType<typeof readCopyrightThreadOperationalCursor>>

export async function assertAbortedCaseThreadPage(
  noticeId: string,
  intakeId: string,
  references: References,
  cursor: Cursor,
  ancestorCount: number,
): Promise<void> {
  expect(await readCopyrightThreadRetirementBound(noticeId)).toBeNull()
  expect(await readCopyrightThreadReferenceState(intakeId)).toEqual(references)
  expect(await readCopyrightThreadOperationalCursor()).toEqual(cursor)
  expect((await readCopyrightIntakeRetentionState(intakeId)).ancestorCount).toBe(ancestorCount)
}

export async function assertIncompleteFinalThreadRun(
  noticeId: string,
  intakeId: string,
  before: References,
  after: References,
  result: { deleted: number; hasMore: boolean },
  cursorBefore: Cursor,
): Promise<void> {
  expect(result.hasMore).toBe(false)
  expect(after.referenceCount).toBeGreaterThan(0)
  expect(after.referenceCount).toBeLessThanOrEqual(before.referenceCount)
  expect(await readCopyrightThreadRetirementBound(noticeId)).not.toBeNull()
  expect((await readCopyrightIntakeRetentionState(intakeId)).ancestorCount).toBe(1)
  if (result.deleted === 0) await assertUnchangedFinalCursor(before, after, cursorBefore)
}

async function assertUnchangedFinalCursor(
  before: References,
  after: References,
  cursorBefore: Cursor,
): Promise<void> {
  expect(after).toEqual(before)
  expect(await readCopyrightThreadOperationalCursor()).toEqual(cursorBefore)
}
