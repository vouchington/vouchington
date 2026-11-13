import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { createTestUser } from './index.mts'
import { createTestCopyrightFormIntakeReview } from './data-stores/psql/copyright-form-reviews.mts'
import { createClearScreenedForm } from './services/copyright-notices/screened-form.mts'
import {
  createCopyrightRestorationHoldFixture,
  createCompliantCounterNoticeDeadline,
} from './copyright-restoration-hold-fixtures.mts'
import {
  openHeldCounterNoticeRestore,
  recordOrdinaryCopyrightHold,
} from './copyright-restoration-hold-scene.mts'
import { seedCopyrightStatementRestriction } from './copyright-statement-restriction-fixture.mts'
import { processCopyrightActionIntent } from '../services/copyright-notices/index.mts'
import { getCopyrightNoticePrivateAggregate } from './services/copyright-notices/private-aggregate.mts'
import { enableAutomaticProvisionalWithholdingForTest } from './services/copyright-notices/automatic-withholding.mts'
import { applyNonSpamSignedInCopyrightFormScreening } from '../services/copyright-notices/form-screenings.mts'
import { suspendUser } from '../services/users/suspension.mts'
import { encryptSecret } from '@modules/token-secrets'
import { notifications } from '@queues/notifications/queues'
import { BACKGROUND_QUEUE_NAME } from '@queues/background/config'
import { readAllQueueJobs } from './queue-jobs.mts'
import { forgetDedupEntries, removeQueuedJobsById } from './shared-queue-cleanup.mts'

/** A committed review whose assessment has not yet been recovered. */
export async function createCopyrightActionSweepReview(accepted: boolean) {
  const [{ notice }, moderator] = await Promise.all([createClearScreenedForm(), createTestUser()])
  await createTestCopyrightFormIntakeReview({
    intakeId: notice.intake.id,
    moderatorId: moderator.id,
    is_accepted: accepted,
  })
  return notice.intake
}

export async function createCopyrightActionSweepEnforcement() {
  const fixture = await createCopyrightRestorationHoldFixture()
  return fixture
}

export async function createCopyrightActionSweepRestricted() {
  const fixture = await createCopyrightRestorationHoldFixture()
  await seedCopyrightStatementRestriction({
    noticeId: fixture.notice.id,
    targetId: fixture.aggregate.targets[0]!.id,
    assessmentId: fixture.assessment.id,
    imposedAt: new Date(),
    moderatorId: fixture.moderator.id,
    revision: fixture.aggregate.targets[0]!.placement_revision,
  })
  const aggregate = await getCopyrightNoticePrivateAggregate(fixture.notice.id)
  const intent = aggregate!.actionIntents.find(item => item.action === 'withhold')!
  return { ...fixture, intent }
}

export async function createCopyrightActionSweepDeadline() {
  const fixture = await createCopyrightActionSweepRestricted()
  const deadline = await createCompliantCounterNoticeDeadline({
    claimant: fixture.claimant,
    noticeId: fixture.notice.id,
    moderator: fixture.moderator,
    targetIds: [fixture.aggregate.targets[0]!.id],
  })
  return { ...fixture, deadline }
}

export async function createCopyrightActionSweepSuspended() {
  const claimant = await createTestUser()
  const { notice } = await createClearScreenedForm(1, { claimant })
  const restore = await enableAutomaticProvisionalWithholdingForTest()
  try {
    await applyNonSpamSignedInCopyrightFormScreening(notice.intake.copyright_notice_submission_id)
  } finally {
    restore()
  }
  const admin = await createTestUser({ administrator: true })
  await suspendUser(admin, claimant.id, 'allow', 'Misused the copyright notice form')
  return notice.intake.copyright_notice_id
}

export async function createCopyrightActionSweepBlocked() {
  const scene = await openHeldCounterNoticeRestore()
  const hold = await recordOrdinaryCopyrightHold(scene)
  await processCopyrightActionIntent(scene.restore.id, scene.restorationAt)
  await write(sql`/* createCopyrightActionSweepBlocked:resolve */
    INSERT INTO copyright_notice_legal_hold_resolutions (
      copyright_notice_legal_hold_assessment_id, resolved_at, resolved_by_id, resolution_kind,
      rationale_ciphertext
    ) VALUES (
      ${hold.id}, ${scene.restorationAt}, ${scene.moderator.id}, 'dismissed',
      ${encryptSecret('Proceeding dismissed.', `copyright-legal-hold-resolution:${hold.id}`)}
    )
  `)
  await removeCopyrightActionSweepJob(scene.restore.id)
  return scene
}

/** Remove the fixture's own earlier enqueue and its throttle window. */
export async function removeCopyrightActionSweepJob(intentId: string) {
  const jobs = await readAllQueueJobs(notifications)
  const ids = jobs.flatMap(job =>
    job.name === 'notifications.processApplyCopyrightAction' &&
    (job.data as { intentId?: string }).intentId === intentId
      ? [job.id]
      : [],
  )
  await removeQueuedJobsById(notifications, ids)
  forgetDedupEntries(BACKGROUND_QUEUE_NAME, [`copyright-action:${intentId}`])
}
