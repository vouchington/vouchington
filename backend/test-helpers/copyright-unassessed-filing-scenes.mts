import {
  createCopyrightRestorationHoldFixture,
  createCompliantCounterNoticeDeadline,
} from './copyright-restoration-hold-fixtures.mts'
import { seedCopyrightStatementRestriction } from './copyright-statement-restriction-fixture.mts'
import { appendTestCopyrightNoticeSubmission } from './copyright-notice-submissions.mts'

export async function openRestorationWindow() {
  const fixture = await createCopyrightRestorationHoldFixture()
  const target = fixture.aggregate.targets[0]!
  const restriction = await seedCopyrightStatementRestriction({
    noticeId: fixture.notice.id,
    targetId: target.id,
    assessmentId: fixture.assessment.id,
    imposedAt: new Date('2026-07-01T12:00:00.000Z'),
    moderatorId: fixture.moderator.id,
    revision: target.placement_revision,
  })
  const deadline = await createCompliantCounterNoticeDeadline({
    claimant: fixture.claimant,
    noticeId: fixture.notice.id,
    moderator: fixture.moderator,
    targetIds: [target.id],
  })
  return {
    ...fixture,
    target,
    restriction,
    deadline,
    now: new Date(deadline.earliest_restoration_at.getTime() + 60_000),
  }
}

export async function recordCourtFiling(
  noticeId: string,
  receivedAt = new Date('2026-07-02T13:00:00.000Z'),
) {
  return appendTestCopyrightNoticeSubmission({
    noticeId,
    kind: 'court_or_ccb_hold',
    receivedAt,
    sourceKind: 'email',
    submittedByUserId: null,
    bodyCiphertext: `hold-${crypto.randomUUID()}`,
  })
}
