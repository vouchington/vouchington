import { describe, expect, it } from 'vitest'
import { readTestOwnedCopyrightSweepIds } from '@voucha/test-helpers/services/copyright-notices/sweep-ids'
import {
  acceptCopyrightNoticeAndImposeRestriction,
  appendCopyrightLegalHoldAssessment,
  appendCopyrightNoticeSubmission,
} from './index.mts'
import {
  createCompliantCounterNoticeDeadline,
  createCopyrightRestorationHoldFixture,
} from './evidence-and-holds-restoration-hold-fixtures.mts'
import {
  createDueStatutoryCopyrightRestoreIntentsForDeadline,
  searchDueStatutoryCopyrightRestorationDeadlineIds,
} from './statutory-restoration-schedule.mts'

async function createCounterNoticedRestriction() {
  const fixture = await createCopyrightRestorationHoldFixture()
  const { aggregate, assessment, claimant, moderator, notice } = fixture
  const target = aggregate.targets[0]!
  await acceptCopyrightNoticeAndImposeRestriction({
    noticeId: notice.id,
    targetId: target.id,
    assessmentId: assessment.id,
    imposedAt: new Date('2026-07-01T12:00:00.000Z'),
    imposedById: moderator.id,
  })
  const deadline = await createCompliantCounterNoticeDeadline({
    claimant: claimant as never,
    noticeId: notice.id,
    moderator,
    targetId: target.id,
  })
  return { deadline, moderator, notice, target }
}

async function materializeListedDeadline(deadlineId: string, now: Date): Promise<number> {
  await expect(readDueDeadlineIds(deadlineId, now)).resolves.toEqual([deadlineId])
  return createDueStatutoryCopyrightRestoreIntentsForDeadline(deadlineId, now)
}

function readDueDeadlineIds(deadlineId: string, now: Date): Promise<string[]> {
  return readTestOwnedCopyrightSweepIds(
    options => searchDueStatutoryCopyrightRestorationDeadlineIds({ ...options, now }),
    deadlineId,
  )
}

describe('statutory copyright restoration schedule', () => {
  it('lists a deadline only once its earliest restoration time has passed', async () => {
    const { deadline } = await createCounterNoticedRestriction()
    const due = deadline.earliest_restoration_at

    await expect(
      readDueDeadlineIds(deadline.id, new Date(due.getTime() - 60_000)),
    ).resolves.toEqual([])
    await expect(readDueDeadlineIds(deadline.id, due)).resolves.toEqual([deadline.id])
  })

  it('materializes a due restore intent and stops listing its deadline', async () => {
    const { deadline } = await createCounterNoticedRestriction()
    const now = new Date(deadline.earliest_restoration_at.getTime() + 60_000)
    await expect(materializeListedDeadline(deadline.id, now)).resolves.toBe(1)
    await expect(readDueDeadlineIds(deadline.id, now)).resolves.toEqual([])
  })

  it('fails closed when a due restoration is blocked by a qualifying legal hold', async () => {
    const { deadline, moderator, notice, target } = await createCounterNoticedRestriction()
    const holdSubmission = await appendCopyrightNoticeSubmission({
      noticeId: notice.id,
      kind: 'court_or_ccb_hold',
      receivedAt: new Date('2026-07-02T13:00:00.000Z'),
      sourceKind: 'email',
      submittedByUserId: null,
      bodyCiphertext: `hold-${crypto.randomUUID()}`,
    })
    await appendCopyrightLegalHoldAssessment({
      currentUser: moderator,
      submissionId: holdSubmission.id,
      assessedAt: new Date('2026-07-02T13:01:00.000Z'),
      fromOriginalClaimant: true,
      proceedingKind: 'ccb',
      ccbClaimKind: 'claim',
      commencedAt: new Date('2026-07-02T13:00:00.000Z'),
      receivedByDesignatedAgentAt: new Date('2026-07-02T13:00:00.000Z'),
      sameMaterial: true,
      targetIds: [target.id],
      rationale: 'Verified qualifying CCB filing.',
    })
    const now = new Date(deadline.earliest_restoration_at.getTime() + 60_000)
    await expect(materializeListedDeadline(deadline.id, now)).rejects.toThrow(
      /Failed to materialize one or more due copyright restoration intents/,
    )
  })
})
