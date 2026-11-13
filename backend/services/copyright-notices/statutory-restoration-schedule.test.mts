import { appendTestCopyrightNoticeSubmission } from '@voucha/test-helpers/copyright-notice-submissions'
import { describe, expect, it } from 'vitest'
import { readTestOwnedCopyrightSweepIds } from '@voucha/test-helpers/services/copyright-notices/sweep-ids'
import { encodeUuidCursorBefore } from '../../test-helpers/modules/pagination/uuid-cursors.mts'
import { seedActionDeliveryRestriction } from '@voucha/test-helpers/copyright-action-delivery-contract-fixtures'
import { seedEvidenceHold } from '@voucha/test-helpers/copyright-evidence-hold-fixture'
import { assertStatutoryScheduleMaterialization } from '@voucha/test-helpers/copyright-statutory-schedule-subject'
import { seedCommittedRestorationIntent } from '@voucha/test-helpers/copyright-restoration-intent-fixture'
import {
  createCompliantCounterNoticeDeadline,
  createCopyrightRestorationHoldFixture,
} from '@voucha/test-helpers/copyright-restoration-hold-fixtures'
import { searchDueStatutoryCopyrightRestorationDeadlineIds } from './statutory-restoration-schedule.mts'

async function createCounterNoticedRestriction() {
  const fixture = await createCopyrightRestorationHoldFixture()
  const { aggregate, assessment, claimant, moderator, notice } = fixture
  const target = aggregate.targets[0]!
  const restriction = await seedActionDeliveryRestriction({
    noticeId: notice.id,
    targetId: target.id,
    assessmentId: assessment.id,
    imposedAt: new Date('2026-07-01T12:00:00.000Z'),
    imposedById: moderator.id,
  })
  const deadline = await createCompliantCounterNoticeDeadline({
    claimant,
    noticeId: notice.id,
    moderator,
    targetIds: [target.id],
  })
  return { deadline, moderator, notice, target, restriction, claimant }
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

  it('returns candidates only for the selected deadline page', async () => {
    const first = await createCounterNoticedRestriction()
    const second = await createCounterNoticedRestriction()
    const [selected, later] = [first, second].toSorted((a, b) =>
      a.deadline.id.localeCompare(b.deadline.id),
    )
    const now = new Date(
      Math.max(
        selected!.deadline.earliest_restoration_at.getTime(),
        later!.deadline.earliest_restoration_at.getTime(),
      ),
    )
    const page = await searchDueStatutoryCopyrightRestorationDeadlineIds({
      now,
      after: encodeUuidCursorBefore(selected!.deadline.id),
      limit: 1,
    })

    expect(page.results).toEqual([selected!.deadline.id])
    expect(page.page_info.has_next_page).toBe(true)
    expect(Object.keys(page.candidates)).toEqual([selected!.deadline.id])
    expect(page.candidates[selected!.deadline.id]).toMatchObject([
      { notice_id: selected!.notice.id, target_id: selected!.target.id },
    ])
  })

  it('materializes a due restore intent and stops listing its deadline', async () => {
    expect.hasAssertions()
    const scene = await createCounterNoticedRestriction()
    const now = new Date(scene.deadline.restoration_deadline_at.getTime() + 1)
    await assertStatutoryScheduleMaterialization(
      {
        noticeId: scene.notice.id,
        restrictionId: scene.restriction.id,
        placementId: scene.target.placement_id,
        accountId: scene.claimant.id,
        deadlineId: scene.deadline.id,
      },
      now,
    )
  })

  it('removes an independently committed materialization from the due deadline list', async () => {
    const scene = await createCounterNoticedRestriction()
    const now = new Date(scene.deadline.restoration_deadline_at.getTime() + 1)
    await seedCommittedRestorationIntent({
      noticeId: scene.notice.id,
      targetId: scene.target.id,
      restrictionId: scene.restriction.id,
      deadlineId: scene.deadline.id,
      expectedPlacementRevision: scene.target.placement_revision,
      now,
    })
    await expect(readDueDeadlineIds(scene.deadline.id, now)).resolves.toEqual([])
  })

  it('fails closed when a due restoration is blocked by a qualifying legal hold', async () => {
    expect.hasAssertions()
    const scene = await createCounterNoticedRestriction()
    const { deadline, moderator, notice, target } = scene
    const holdSubmission = await appendTestCopyrightNoticeSubmission({
      noticeId: notice.id,
      kind: 'court_or_ccb_hold',
      receivedAt: new Date('2026-07-02T13:00:00.000Z'),
      sourceKind: 'email',
      submittedByUserId: null,
      bodyCiphertext: `hold-${crypto.randomUUID()}`,
    })
    await seedEvidenceHold({
      noticeId: notice.id,
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
    await assertStatutoryScheduleMaterialization(
      {
        noticeId: notice.id,
        restrictionId: scene.restriction.id,
        placementId: target.placement_id,
        accountId: scene.claimant.id,
        deadlineId: deadline.id,
      },
      now,
      true,
    )
  })
})
