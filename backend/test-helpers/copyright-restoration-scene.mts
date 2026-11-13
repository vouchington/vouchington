import { beginTransaction } from '@data-stores/psql'
import sql from 'sql-template-strings'
import {
  createTestUserDirect,
  getTestPostImagePlacement,
  insertTestImage,
  insertTestPost,
  insertTestPostImage,
} from './index.mts'
import { createCopyrightNoticeAggregate } from './services/copyright-notices/create-notice-aggregate.mts'
import { getCopyrightNoticePrivateAggregate } from './services/copyright-notices/private-aggregate.mts'
import {
  appendTestCopyrightNoticeSubmission,
  seedCopyrightSubmissionAssessment,
} from './copyright-notice-submissions.mts'
import {
  seedCopyrightUnreviewedRestriction,
  seedCopyrightRaceCounterDeadline,
} from './copyright-assessment-race-fixtures.mts'
import { seedEffectiveConfirmation } from './copyright-effective-review-decisions.mts'
import {
  seedRestorationSceneWithhold,
  assertRestorationSceneFilingBlocks,
} from './copyright-withhold-scene-fixture.mts'
import { createDeterministicCopyrightCorrespondenceInTransaction } from '../services/copyright-notices/correspondence.mts'
import { createCopyrightDeliveryIntent } from '../services/copyright-notices/delivery-intents.mts'
import { recordCounterNoticeRestoration } from '../services/copyright-notices/claimant-misuse-ledger.mts'
import type { CopyrightActionIntentRecord } from '../services/copyright-notices/types.mts'

/** A complete one-target restoration dependency with an independently blocking committed filing. */
export async function createCommittedCopyrightRestorationScene() {
  const [claimant, reviewer] = await Promise.all([createTestUserDirect(), createTestUserDirect()])
  const moderator = { ...reviewer, roles: ['moderator'] } as typeof reviewer
  const postId = await insertTestPost({
    title: `restoration ${crypto.randomUUID()}`,
    slug: `restoration-${crypto.randomUUID()}`,
    createdById: claimant.id,
    markdown: 'image',
  })
  const imageId = await insertTestImage(claimant.id)
  await insertTestPostImage({ postId, imageId })
  const placement = await getTestPostImagePlacement(postId, imageId)
  if (!placement) throw new Error('Owned restoration placement disappeared')
  const notice = await createCopyrightNoticeAggregate({
    jurisdiction: 'us_dmca',
    receivedAt: new Date('2026-06-30T16:00:00.000Z'),
    claimantUserId: claimant.id,
    claimantDisplayName: null,
    claimantContactCiphertext: `ciphertext-${crypto.randomUUID()}`,
    workDescription: `work-${crypto.randomUUID()}`,
    policyVersion: 'test-v1',
    initialSubmission: { kind: 'notice', sourceKind: 'signed_in_form', bodyCiphertext: 'notice' },
    targets: [
      {
        placementId: placement.placement_id,
        placementRevision: placement.placement_revision,
        imageId,
        bindingFamily: 'post',
        hostedUseUrl: `https://example.test/${crypto.randomUUID()}`,
      },
    ],
  })
  const received = await getCopyrightNoticePrivateAggregate(notice.id)
  const target = received?.targets[0]
  const submission = received?.submissions[0]
  if (!target || !submission) throw new Error('Owned restoration notice disappeared')
  const assessment = await seedCopyrightSubmissionAssessment({
    submissionId: submission.id,
    assessedAt: new Date('2026-07-01T11:00:00.000Z'),
    currentUser: moderator,
    substantiallyCompliant: true,
  })
  await seedClaimantReceipt(notice.id, submission.id)
  const seeded = await seedCopyrightUnreviewedRestriction({
    noticeId: notice.id,
    targetId: target.id,
    assessmentId: assessment.id,
    revision: target.placement_revision,
  })
  await seedEffectiveConfirmation(notice.id, seeded.id, moderator)
  const restricted = await getCopyrightNoticePrivateAggregate(notice.id)
  const initialIntent = restricted?.actionIntents.find(row => row.action === 'withhold')
  if (!initialIntent) throw new Error('Owned withhold dependency disappeared')
  const withheld = await seedRestorationSceneWithhold(initialIntent.id)
  const deadline = await seedCopyrightRaceCounterDeadline({
    noticeId: notice.id,
    targetId: target.id,
    claimantId: claimant.id,
    moderator,
  })
  const restorationAt = new Date(deadline.earliest_restoration_at.getTime() + 60_000)
  // oxlint-disable-next-line react-doctor/async-parallel -- commit the same-case withhold lifecycle/clock before counter assessment/review lifecycle/clock; fixture stages do not race.
  const restore = await seedRestoreIntent({
    noticeId: notice.id,
    restrictionId: seeded.id,
    deadlineId: deadline.id,
    revision: withheld.revision,
    now: restorationAt,
  })
  // The filing itself is committed before either subject actor. Its later assessment may abort.
  const holdSubmission = await appendTestCopyrightNoticeSubmission({
    noticeId: notice.id,
    kind: 'court_or_ccb_hold',
    receivedAt: new Date(restorationAt.getTime() - 1),
    sourceKind: 'email',
    submittedByUserId: null,
    bodyCiphertext: `concurrent-hold-${crypto.randomUUID()}`,
  })
  const [complete] = await Promise.all([
    getCopyrightNoticePrivateAggregate(notice.id),
    assertRestorationSceneFilingBlocks(notice.id),
  ])
  const restriction = complete?.restrictions.find(row => row.id === seeded.id)
  const initialWithhold = complete?.actionIntents.find(row => row.id === initialIntent.id)
  if (!restriction || !initialWithhold)
    throw new Error('Committed restoration dependencies disappeared')
  if (
    initialWithhold.state !== 'completed' ||
    initialWithhold.attempt_count !== 1 ||
    restriction.lifted_at !== null ||
    restriction.human_review_action !== 'confirm'
  )
    throw new Error('Committed restoration scene lacked its complete prior withhold')
  return {
    claimant,
    moderator,
    notice,
    target,
    restriction,
    initialWithhold,
    restorationAt,
    restore,
    holdSubmission,
  }
}

async function seedClaimantReceipt(noticeId: string, submissionId: string) {
  await using transaction = await beginTransaction()
  const correspondence = await createDeterministicCopyrightCorrespondenceInTransaction(
    {
      noticeId,
      submissionId,
      correspondenceKind: 'receipt',
      bodyText: 'Your copyright notice was received.',
    },
    transaction,
  )
  await transaction(sql`/* seedRestorationSceneReceipt:event */
    INSERT INTO copyright_notice_lifecycle_changes (copyright_notice_id, change_type,
      copyright_notice_correspondence_id) VALUES (${noticeId}, 'outbound_correspondence_created', ${correspondence.id})`)
  await createCopyrightDeliveryIntent(
    {
      noticeId,
      submissionId,
      correspondenceId: correspondence.id,
      recipientUserId: null,
      recipientRole: 'claimant',
      deliveryKind: 'claimant_receipt',
      channel: 'email',
      idempotencyKey: `copyright-scene:${crypto.randomUUID()}`,
      recipientEmail: `tests+${crypto.randomUUID()}@voucha.ai`,
    },
    transaction,
  )
  await transaction.commit()
}

async function seedRestoreIntent(input: {
  noticeId: string
  restrictionId: string
  deadlineId: string
  revision: number
  now: Date
}) {
  await using transaction = await beginTransaction()
  const { rows } =
    await transaction<CopyrightActionIntentRecord>(sql`/* seedRestorationSceneRestore */
    INSERT INTO copyright_notice_action_work_items (copyright_restriction_id, copyright_notice_deadline_id,
      expected_placement_revision, action) VALUES (${input.restrictionId}, ${input.deadlineId}, ${input.revision}, 'restore')
    RETURNING id, copyright_restriction_id, copyright_notice_deadline_id, expected_placement_revision,
      action, state, attempt_count, completed_at`)
  const restore = rows[0]
  if (!restore) throw new Error('Owned restoration intent disappeared')
  await recordCounterNoticeRestoration(transaction, input)
  await transaction(sql`/* seedRestorationSceneRestore:event */
    INSERT INTO copyright_notice_lifecycle_changes (copyright_notice_id, change_type, copyright_notice_action_intent_id)
    VALUES (${input.noticeId}, 'restoration_intent_created', ${restore.id})`)
  await transaction.commit()
  return restore
}
