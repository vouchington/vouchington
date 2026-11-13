import { prepublishCopyrightImagePlacementDenial } from '../services/copyright-notices/action-delivery-edge.mts'
import { createTestUserDirect } from '@voucha/test-helpers'
import {
  createFixtureTargets,
  currentSharedTarget,
  type SharedPlacement,
} from './copyright-restoration-hold-targets.mts'
import type {
  createCopyrightCounterNotice,
  reviewCopyrightCounterNotice,
} from '../services/copyright-notices/index.mts'
import { beginTransaction } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { seedRestorationSceneWithhold } from './copyright-withhold-scene-fixture.mts'
import { seedRestorationCounterNotice } from './copyright-restoration-counter-notice-fixture.mts'
import { seedRestorationCounterApproval } from './copyright-restoration-counter-approval-fixture.mts'
import { seedCommittedRestorationIntent } from './copyright-restoration-intent-fixture.mts'
import { seedCopyrightSubmissionAssessment } from './copyright-notice-submissions.mts'
import { createCopyrightDeliveryIntent } from '../services/copyright-notices/delivery-intents.mts'
import { createDeterministicCopyrightCorrespondenceInTransaction } from '../services/copyright-notices/correspondence.mts'
import { createCopyrightNoticeAggregate } from '@voucha/test-helpers/services/copyright-notices/create-notice-aggregate'
import { getCopyrightNoticePrivateAggregate } from '@voucha/test-helpers/services/copyright-notices/private-aggregate'

/** A `shared` placement gives the notice one target on a placement another notice already restricts. */
export async function createCopyrightRestorationHoldFixture(
  targetCount = 1,
  shared?: SharedPlacement,
) {
  const [newClaimant, moderatorRecord] = await Promise.all([
    createTestUserDirect(),
    createTestUserDirect(),
  ])
  const claimant = shared?.claimant ?? newClaimant
  const moderator = { ...moderatorRecord, roles: ['moderator'] } as typeof moderatorRecord
  const targets = shared
    ? [await currentSharedTarget(shared)]
    : await createFixtureTargets(claimant.id, targetCount)
  const notice = await createCopyrightNoticeAggregate({
    jurisdiction: 'us_dmca',
    receivedAt: new Date('2026-06-30T16:00:00.000Z'),
    claimantUserId: claimant.id,
    claimantDisplayName: null,
    claimantContactCiphertext: `ciphertext-${crypto.randomUUID()}`,
    workDescription: `work-${crypto.randomUUID()}`,
    policyVersion: 'test-v1',
    initialSubmission: { kind: 'notice', sourceKind: 'signed_in_form', bodyCiphertext: 'notice' },
    targets,
  })
  const aggregate = await getCopyrightNoticePrivateAggregate(notice.id)
  if (!aggregate) throw new Error('fixture notice disappeared')
  const { assessment } = await createAssessmentAndReceipt(aggregate, moderator, notice.id)
  return { aggregate, assessment, claimant, moderator, notice }
}

async function createAssessmentAndReceipt(
  aggregate: NonNullable<Awaited<ReturnType<typeof getCopyrightNoticePrivateAggregate>>>,
  moderator: Awaited<ReturnType<typeof createTestUserDirect>>,
  noticeId: string,
) {
  const assessment = await seedCopyrightSubmissionAssessment({
    submissionId: aggregate.submissions[0].id,
    assessedAt: new Date('2026-07-01T11:00:00.000Z'),
    currentUser: moderator,
    substantiallyCompliant: true,
  })
  await using transaction = await beginTransaction()
  const receipt = await createDeterministicCopyrightCorrespondenceInTransaction(
    {
      noticeId,
      submissionId: aggregate.submissions[0].id,
      correspondenceKind: 'receipt',
      bodyText: `receipt-${crypto.randomUUID()}`,
    },
    transaction,
  )
  await transaction(sql`/* createAssessmentAndReceipt:event */
    INSERT INTO copyright_notice_lifecycle_changes (copyright_notice_id, change_type, copyright_notice_correspondence_id)
    VALUES (${noticeId}, 'outbound_correspondence_created', ${receipt.id})`)
  await createCopyrightDeliveryIntent(
    {
      noticeId,
      submissionId: aggregate.submissions[0].id,
      correspondenceId: receipt.id,
      recipientUserId: null,
      recipientRole: 'claimant',
      deliveryKind: 'claimant_receipt',
      channel: 'email',
      idempotencyKey: `copyright-hold-receipt-${crypto.randomUUID()}`,
      recipientEmail: `tests+copyright-${crypto.randomUUID()}@voucha.ai`,
    },
    transaction,
  )
  await transaction.commit()
  return { assessment, receipt }
}

export async function deliverInitialCopyrightWithhold(noticeId: string): Promise<void> {
  const aggregate = await getCopyrightNoticePrivateAggregate(noticeId)
  const withhold = aggregate?.actionIntents.find(intent => intent.action === 'withhold')
  const restriction = aggregate?.restrictions.find(
    row => row.id === withhold?.copyright_restriction_id,
  )
  const target = aggregate?.targets.find(row => row.id === restriction?.copyright_notice_target_id)
  if (!withhold || !target) throw new Error('initial withhold intent disappeared')
  await prepublishCopyrightImagePlacementDenial({
    placementId: target.placement_id,
    revision: withhold.expected_placement_revision,
    imageId: target.image_id,
  })
  await seedRestorationSceneWithhold(withhold.id)
}

export async function createCompliantCounterNoticeDeadline(input: {
  claimant: Parameters<typeof createCopyrightCounterNotice>[0]
  noticeId: string
  moderator: Parameters<typeof reviewCopyrightCounterNotice>[0]['currentUser']
  targetIds: string[]
}) {
  const counterNotice = await seedRestorationCounterNotice(
    input.claimant,
    input.noticeId,
    input.targetIds,
  )
  const { deadline } = await seedRestorationCounterApproval({
    noticeId: input.noticeId,
    submissionId: counterNotice.submission.id,
    moderator: input.moderator,
  })
  return deadline
}

export async function createCounterNoticeRestoreIntent(input: {
  claimant: Parameters<typeof createCopyrightCounterNotice>[0]
  noticeId: string
  moderator: Parameters<typeof reviewCopyrightCounterNotice>[0]['currentUser']
  targetId: string
  restrictionId: string
  placementRevision: number
  offsetMs?: number
}) {
  const deadline = await createCompliantCounterNoticeDeadline({
    claimant: input.claimant,
    noticeId: input.noticeId,
    moderator: input.moderator,
    targetIds: [input.targetId],
  })
  const now = new Date(deadline.earliest_restoration_at.getTime() + (input.offsetMs ?? 60_000))
  const restore = await seedCommittedRestorationIntent({
    noticeId: input.noticeId,
    targetId: input.targetId,
    restrictionId: input.restrictionId,
    deadlineId: deadline.id,
    expectedPlacementRevision: input.placementRevision,
    now,
  })
  return { deadline, now, restore }
}
