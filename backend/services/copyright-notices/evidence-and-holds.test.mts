import {
  createTwoTargetFixture,
  seedEvidenceCounterDeadline,
} from '@voucha/test-helpers/copyright-evidence-scene'
import { seedCopyrightStatementRestriction } from '@voucha/test-helpers/copyright-statement-restriction-fixture'
import {
  seedEvidenceHold,
  seedEvidenceHoldResolution,
} from '@voucha/test-helpers/copyright-evidence-hold-fixture'
import { assertEvidenceRestoreProbe } from '@voucha/test-helpers/copyright-evidence-restore-outcome'
import { appendTestCopyrightNoticeSubmission } from '@voucha/test-helpers/copyright-notice-submissions'
import { describe, expect, it } from 'vitest'
import { insertCopyrightEvidenceArtifact } from '@voucha/test-helpers/data-stores/psql/copyright-evidence-artifacts'
import { getCopyrightNoticePrivateAggregate } from '@voucha/test-helpers/services/copyright-notices/private-aggregate'

describe('copyright notice evidence and holds', () => {
  it('retains evidence and scopes a qualifying hold to only its identified target', async () => {
    const { aggregate, claimant, moderator, notice, noticeAssessment } =
      await createTwoTargetFixture()
    const [heldTarget, otherTarget] = aggregate.targets
    const artifactId = await insertCopyrightEvidenceArtifact({
      submissionId: aggregate.submissions[0].id,
      storageKey: `copyright-inbound/${crypto.randomUUID()}.eml`,
      sha256: Buffer.alloc(32, 7),
      mimeType: 'message/rfc822',
      byteSize: 42,
    })
    const restrictions = await Promise.all(
      [heldTarget, otherTarget].map(target =>
        seedCopyrightStatementRestriction({
          noticeId: notice.id,
          targetId: target.id,
          assessmentId: noticeAssessment.id,
          revision: target.placement_revision,
          imposedAt: new Date('2026-07-01T12:00:00.000Z'),
          moderatorId: moderator.id,
        }),
      ),
    )
    const deadline = await seedEvidenceCounterDeadline({
      claimantId: claimant.id,
      noticeId: notice.id,
      moderator,
      targetIds: [heldTarget.id, otherTarget.id],
    })
    const restorationNow = new Date(deadline.earliest_restoration_at.getTime() + 86_400_000)
    const holdSubmission = await appendTestCopyrightNoticeSubmission({
      noticeId: notice.id,
      kind: 'court_or_ccb_hold',
      receivedAt: new Date('2026-07-01T12:00:00.000Z'),
      sourceKind: 'email',
      submittedByUserId: null,
      bodyCiphertext: `hold-${crypto.randomUUID()}`,
    })
    const hold = await seedEvidenceHold({
      noticeId: notice.id,
      currentUser: moderator,
      submissionId: holdSubmission.id,
      assessedAt: new Date('2026-07-01T12:01:00.000Z'),
      fromOriginalClaimant: true,
      proceedingKind: 'ccb',
      ccbClaimKind: 'claim',
      commencedAt: new Date('2026-07-01T12:00:00.000Z'),
      receivedByDesignatedAgentAt: new Date('2026-07-01T12:00:00.000Z'),
      sameMaterial: true,
      targetIds: [heldTarget.id],
      rationale: 'Verified qualifying CCB filing.',
    })
    await assertEvidenceRestoreProbe(
      {
        noticeId: notice.id,
        targetId: heldTarget.id,
        restrictionId: restrictions[0].id,
        deadlineId: deadline.id,
        expectedPlacementRevision: heldTarget.placement_revision,
        now: restorationNow,
      },
      false,
    )
    await assertEvidenceRestoreProbe(
      {
        noticeId: notice.id,
        targetId: otherTarget.id,
        restrictionId: restrictions[1].id,
        deadlineId: deadline.id,
        expectedPlacementRevision: otherTarget.placement_revision,
        now: restorationNow,
      },
      true,
    )
    const resolution = await seedEvidenceHoldResolution({
      noticeId: notice.id,
      currentUser: moderator,
      assessmentId: hold.id,
      resolvedAt: new Date(restorationNow.getTime() + 60_000),
      resolutionKind: 'dismissed',
      rationale: `resolution-${crypto.randomUUID()}`,
    })
    await assertEvidenceRestoreProbe(
      {
        noticeId: notice.id,
        targetId: heldTarget.id,
        restrictionId: restrictions[0].id,
        deadlineId: deadline.id,
        expectedPlacementRevision: heldTarget.placement_revision,
        now: new Date(restorationNow.getTime() + 120_000),
      },
      true,
    )
    const refreshed = await getCopyrightNoticePrivateAggregate(notice.id)

    expect(resolution.copyright_notice_legal_hold_assessment_id).toBe(hold.id)
    expect(hold.target_ids).toEqual([heldTarget.id])
    expect(refreshed?.evidenceArtifacts).toContainEqual(
      expect.objectContaining({ id: artifactId, byte_size: 42 }),
    )
    expect(refreshed?.holdAssessments).toContainEqual(
      expect.objectContaining({ id: hold.id, target_ids: [heldTarget.id] }),
    )
  })
})
