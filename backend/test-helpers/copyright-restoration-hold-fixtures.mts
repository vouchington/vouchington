import { createTestUserDirect } from '@voucha/test-helpers'
import {
  createFixtureTargets,
  currentSharedTarget,
  type SharedPlacement,
} from './copyright-restoration-hold-targets.mts'
import {
  createCopyrightCounterNotice,
  processCopyrightActionIntent,
  reviewCopyrightCounterNotice,
} from '../services/copyright-notices/index.mts'
import { seedCopyrightSubmissionAssessment } from './copyright-notice-submissions.mts'
import { createCopyrightDeliveryIntent } from '../services/copyright-notices/delivery-intents.mts'
import { createEligibleCopyrightRestoreIntent } from '../services/copyright-notices/restoration.mts'
import { createOutboundCopyrightCorrespondence } from '../services/copyright-notices/correspondence.mts'
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
  const { assessment, receipt } = await createAssessmentAndReceipt(aggregate, moderator, notice.id)
  await createCopyrightDeliveryIntent({
    noticeId: notice.id,
    submissionId: aggregate.submissions[0].id,
    correspondenceId: receipt.id,
    recipientUserId: null,
    recipientRole: 'claimant',
    deliveryKind: 'claimant_receipt',
    channel: 'email',
    idempotencyKey: `copyright-hold-receipt-${crypto.randomUUID()}`,
    recipientEmail: `tests+copyright-${crypto.randomUUID()}@voucha.ai`,
  })
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
  const receipt = await createOutboundCopyrightCorrespondence({
    noticeId,
    submissionId: aggregate.submissions[0].id,
    correspondenceKind: 'receipt',
    compositionKind: 'deterministic_template',
    bodyCiphertext: `receipt-${crypto.randomUUID()}`,
    draftedById: null,
  })
  return { assessment, receipt }
}

export async function deliverInitialCopyrightWithhold(noticeId: string): Promise<void> {
  const withhold = (await getCopyrightNoticePrivateAggregate(noticeId))?.actionIntents.find(
    intent => intent.action === 'withhold',
  )
  if (!withhold) throw new Error('initial withhold intent disappeared')
  const result = await processCopyrightActionIntent(withhold.id, new Date())
  if (result !== 'applied') throw new Error(`Initial withhold was not applied: ${result}`)
}

/** Accepts a counter-notice through the production moderator review and returns its deadline row. */
export async function acceptCounterNoticeForRestoration(input: {
  noticeId: string
  submissionId: string
  moderator: Parameters<typeof reviewCopyrightCounterNotice>[0]['currentUser']
}) {
  const { assessmentId, deadlineId } = await reviewCopyrightCounterNotice({
    submissionId: input.submissionId,
    currentUser: input.moderator,
    is_accepted: true,
    rationale: 'The structured counter-notice is formally complete.',
  })
  const aggregate = await getCopyrightNoticePrivateAggregate(input.noticeId)
  const deadline = aggregate?.deadlines.find(row => row.id === deadlineId)
  if (!deadline) throw new Error('accepted counter-notice deadline disappeared')
  return { assessmentId, deadline }
}

export async function createCompliantCounterNoticeDeadline(input: {
  claimant: Parameters<typeof createCopyrightCounterNotice>[0]
  noticeId: string
  moderator: Parameters<typeof reviewCopyrightCounterNotice>[0]['currentUser']
  targetIds: string[]
}) {
  const counterNotice = await createCopyrightCounterNotice(
    input.claimant,
    input.noticeId,
    crypto.randomUUID(),
    {
      name: 'Poster',
      address: '1 Main Street',
      telephone: '555-0100',
      consentToFederalJurisdiction: true,
      consentToServiceOfProcess: true,
      goodFaithMisidentificationUnderPenaltyOfPerjury: true,
      electronicSignature: 'Poster',
      targetIds: input.targetIds,
    },
  )
  const { deadline } = await acceptCounterNoticeForRestoration({
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
  const restore = await createEligibleCopyrightRestoreIntent({
    noticeId: input.noticeId,
    targetId: input.targetId,
    restrictionId: input.restrictionId,
    deadlineId: deadline.id,
    expectedPlacementRevision: input.placementRevision,
    now,
  })
  return { deadline, now, restore }
}
