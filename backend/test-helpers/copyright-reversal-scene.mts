import { beginTransaction } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { encryptSecret } from '@modules/token-secrets'
import { createTestUserDirect } from './index.mts'
import { resolveCopyrightImagePlacement } from '../services/copyright-notices/placement-resolution.mts'
import { createCopyrightNoticeAggregate } from './services/copyright-notices/create-notice-aggregate.mts'
import { getCopyrightNoticePrivateAggregate } from './services/copyright-notices/private-aggregate.mts'
import { seedCopyrightSubmissionAssessment } from './copyright-notice-submissions.mts'
import { seedCopyrightStatementRestriction } from './copyright-statement-restriction-fixture.mts'
import {
  seedEffectiveConfirmation,
  seedEffectiveReviewAppeal,
  seedEffectiveAppealDecision,
} from './copyright-effective-review-decisions.mts'
import { getPrivateUserByAny } from '../services/users/get.mts'
import { createCopyrightRestoreIntentForReversalInTransaction } from '../services/copyright-notices/restoration-reversal.mts'
import { createCopyrightClaimantDecisionNoticeInTransaction } from '../services/copyright-notices/claimant-decision-notices.mts'
import { applyCopyrightConfirmationConsequencesInTransaction } from '../services/copyright-notices/staydown-registration.mts'
import type { createTestCopyrightImageFixture } from './copyright-surface-target-fixtures.mts'
import type { PrivateUser } from '../services/users/types.mts'

type Image = Awaited<ReturnType<typeof createTestCopyrightImageFixture>>
export async function createCommittedSurfaceRestriction(images: Image[], reviewed = false) {
  const moderator = await createTestUserDirect({ extraRoles: ['moderator'] })
  const targets = await Promise.all(
    images.map(image => resolveCopyrightImagePlacement(image.selector)),
  )
  const notice = await createCopyrightNoticeAggregate({
    jurisdiction: 'us_dmca',
    receivedAt: new Date(),
    claimantUserId: null,
    claimantDisplayName: 'Test claimant',
    claimantContactCiphertext: crypto.randomUUID(),
    workDescription: crypto.randomUUID(),
    policyVersion: 'test-v1',
    initialSubmission: {
      kind: 'notice',
      sourceKind: 'email',
      bodyCiphertext: crypto.randomUUID(),
    },
    targets,
  })
  const received = await getCopyrightNoticePrivateAggregate(notice.id)
  if (!received) throw new Error('Owned surface case disappeared')
  const assessment = await seedCopyrightSubmissionAssessment({
    submissionId: received.submissions[0]!.id,
    assessedAt: new Date(),
    currentUser: moderator,
    substantiallyCompliant: true,
  })
  const restrictions = []
  for (const target of received.targets)
    restrictions.push(
      await seedCopyrightStatementRestriction({
        noticeId: notice.id,
        targetId: target.id,
        assessmentId: assessment.id,
        revision: target.placement_revision,
        moderatorId: moderator.id,
        reviewed,
      }),
    )
  const aggregate = await getCopyrightNoticePrivateAggregate(notice.id)
  if (!aggregate) throw new Error('Committed surface case disappeared')
  return {
    noticeId: notice.id,
    moderator,
    targets: received.targets,
    restrictions,
    actionIntents: aggregate.actionIntents,
  }
}

export async function seedCommittedSourceReversal(
  scene: Awaited<ReturnType<typeof createCommittedSurfaceRestriction>>,
  source: 'review' | 'appeal',
  actorId: string,
) {
  const restriction = scene.restrictions[0]!
  if (source === 'review')
    return seedEffectiveConfirmation(scene.noticeId, restriction.id, scene.moderator, 'reverse')
  const actor = await getPrivateUserByAny(actorId)
  if (!actor) throw new Error('Owned appellant disappeared')
  const appeal = await seedEffectiveReviewAppeal(
    scene.noticeId,
    actor.id,
    restriction.copyright_notice_target_id,
  )
  await seedEffectiveAppealDecision(
    {
      submissionId: appeal.submission.id,
      currentUser: scene.moderator,
      recommendationId: null,
      manualFallbackReason: 'Manual review required.',
      rationale: 'The supplied record supports reversal.',
      decisions: [{ restrictionId: restriction.id, action: 'reverse' }],
    },
    scene.noticeId,
  )
}

export async function seedCommittedAdministratorLift(
  noticeId: string,
  restrictionId: string,
  administrator: PrivateUser,
) {
  await using transaction = await beginTransaction()
  const now = new Date()
  const rationale = encryptSecret(
    'Provider-owned image restored.',
    `copyright-restriction-lift:${restrictionId}`,
  )
  await transaction(sql`/* seedCommittedAdministratorLift:current */
    UPDATE copyright_restrictions SET administrator_lift_decided_at = ${now},
      administrator_lift_decided_by_id = ${administrator.id}, administrator_lift_rationale_ciphertext = ${rationale}
    WHERE id = ${restrictionId}`)
  await transaction(sql`/* seedCommittedAdministratorLift:record */
    INSERT INTO copyright_restriction_administrator_lifts (copyright_restriction_id, lifted_at, lifted_by_id, rationale_ciphertext)
    VALUES (${restrictionId}, ${now}, ${administrator.id}, ${rationale})`)
  await transaction(sql`/* seedCommittedAdministratorLift:event */
    INSERT INTO copyright_notice_lifecycle_changes (copyright_notice_id, change_type, changed_by_id, copyright_restriction_id)
    VALUES (${noticeId}, 'restriction_lifted_by_administrator', ${administrator.id}, ${restrictionId})`)
  await createCopyrightRestoreIntentForReversalInTransaction(restrictionId, transaction)
  await createCopyrightClaimantDecisionNoticeInTransaction(
    { noticeId, event: 'reversed' },
    transaction,
  )
  await applyCopyrightConfirmationConsequencesInTransaction(noticeId, transaction)
  await transaction.commit()
}
