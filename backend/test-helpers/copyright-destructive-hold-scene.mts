import { readCopyrightPurgeCaseClock } from './copyright-account-hold-race-state.mts'
import type { CopyrightCasePurgeJobData } from '../queues/psql/types.mts'
import { createTestUser } from './index.mts'
import { createRetentionParsedEmail } from './services/copyright-notices/retention-parsed-email.mts'
import { readCopyrightIntakeRetentionState } from './copyright-email-retention-state.mts'
import { linkTestCopyrightEmailIntake } from './copyright-operational-email-retention.mts'
import {
  createCopyrightNoticeForManualAssociation,
  markTestCopyrightNoticeErasedAndCommit,
} from './copyright-email-manual-association.mts'
import { addCopyrightCasePurgeFixtureParty } from './services/copyright-notices/retention-case-purge-fixture.mts'
import {
  appendTestCopyrightNoticeSubmission,
  seedCopyrightSubmissionAssessment,
} from './copyright-notice-submissions.mts'
import { getCopyrightNoticePrivateAggregate } from './services/copyright-notices/private-aggregate.mts'
import { readCopyrightAssessmentPointers } from './copyright-form-review-assessment-race.mts'
import { readCopyrightEmailIntakeNoticeLinks } from './data-stores/psql/copyright-email-intakes.mts'
import { linkCopyrightEmailIntakeToNotice } from './copyright-email-intake-link.mts'
import { eraseTestCopyrightEmailIntakeOriginal } from './copyright-email-intake-retention.mts'
import { createUnparsedCopyrightEmailIntake } from './copyright-email-intake-fixtures.mts'
import {
  COPYRIGHT_CASE_PURGE_PHASES,
  COPYRIGHT_CASE_EMAIL_LINK_PHASE_INDEX,
} from '@data-stores/psql/copyright-case-purge-order'
import { runCopyrightCasePurgePage } from '../services/copyright-notices/retention-case-purge-page.mts'

export const destructiveHoldNow = new Date('2100-01-01T12:00:00.000Z')
export type DestructiveHoldBranch =
  | 'lifecycle'
  | 'nested'
  | 'pointers'
  | 'children'
  | 'email_links'
  | 'final'

/** Each case owns its legal parties, proof cursor and complete selected SQL family. */
export async function createCopyrightDestructiveHoldScene(branch: DestructiveHoldBranch) {
  const admin = await createTestUser({ administrator: true, extraRoles: ['moderator'] })
  const party = await createTestUser()
  const noticeId = await createCopyrightNoticeForManualAssociation()
  await addCopyrightCasePurgeFixtureParty(noticeId, party.id)
  if (branch === 'lifecycle' || branch === 'children' || branch === 'pointers') {
    const submission = await appendTestCopyrightNoticeSubmission({
      noticeId,
      kind: 'notice',
      sourceKind: 'staff',
      submittedByUserId: admin.id,
      receivedAt: new Date(),
      bodyCiphertext: 'Owned retained decision.',
    })
    await seedCopyrightSubmissionAssessment({
      submissionId: submission.id,
      currentUser: admin,
      assessedAt: new Date(),
      substantiallyCompliant: true,
    })
  }
  let intakeId: string | undefined
  if (branch === 'nested') {
    const intake = await createRetentionParsedEmail('held-nested-leaf', {
      replyReferences: [`<${crypto.randomUUID()}@example.test>`],
    })
    intakeId = intake.id
    await linkTestCopyrightEmailIntake(intake.id, noticeId, 'thread', admin.id)
  }
  if (branch === 'email_links') {
    const intake = await createUnparsedCopyrightEmailIntake()
    intakeId = intake.id
    if (!(await linkCopyrightEmailIntakeToNotice({ intakeId, noticeId, linkKind: 'thread' })))
      throw new Error('Owned thread-link fixture was not inserted')
    await eraseTestCopyrightEmailIntakeOriginal(intakeId)
  }
  await markTestCopyrightNoticeErasedAndCommit(noticeId)
  const first = await runCopyrightCasePurgePage(
    {
      noticeId,
      phase: 'parties',
      phaseIndex: 0,
      afterId: null,
      legalClockAt: null,
      proofVersion: null,
    },
    destructiveHoldNow,
  )
  const family =
    branch === 'nested'
      ? 'copyright_notice_email_intake_attachments'
      : 'copyright_notice_lifecycle_changes'
  const index = COPYRIGHT_CASE_PURGE_PHASES.findIndex(phase => phase[0] === family)
  if (index < 0) throw new Error('Owned destructive family is not in the real purge order')
  const phase = branch === 'pointers' || branch === 'final' ? branch : 'children'
  const phaseIndex =
    branch === 'pointers'
      ? 1
      : branch === 'final'
        ? 0
        : branch === 'email_links'
          ? COPYRIGHT_CASE_EMAIL_LINK_PHASE_INDEX
          : index
  const data: CopyrightCasePurgeJobData = { ...first.data, phase, phaseIndex, afterId: null }
  const readState = async () => ({
    aggregate: await getCopyrightNoticePrivateAggregate(noticeId),
    clock: await readCopyrightPurgeCaseClock(noticeId),
    pointers: await readCopyrightAssessmentPointers(noticeId),
    links: intakeId ? await readCopyrightEmailIntakeNoticeLinks(intakeId) : null,
    intake: intakeId ? await readCopyrightIntakeRetentionState(intakeId) : null,
  })
  const before = await readState()
  if (!before.aggregate) throw new Error('Owned destructive case is missing')
  const committed = {
    ...before,
    ...(branch === 'final' ? { aggregate: null, pointers: [], clock: null } : {}),
    ...(branch === 'email_links'
      ? { links: [], intake: { ...before.intake!, intakeExists: false } }
      : {}),
    ...(branch === 'nested' ? { intake: { ...before.intake!, attachmentCount: 0 } } : {}),
    ...(branch === 'lifecycle' || branch === 'children'
      ? { aggregate: { ...before.aggregate, lifecycleEvents: [] } }
      : {}),
    ...(branch === 'pointers'
      ? {
          pointers: before.pointers.map(row => ({ ...row, current_assessment_identity_id: null })),
          aggregate: {
            ...before.aggregate,
            submissions: before.aggregate.submissions.map(row => ({
              ...row,
              copyright_notice_guest_capability_id: null,
              current_assessment_identity_id: null,
              current_assessment_is_substantially_compliant: null,
              current_assessed_at: null,
              current_assessed_by_id: null,
              current_assessment_form_screening_id: null,
            })),
          },
        }
      : {}),
  }
  return { admin, party, noticeId, data, before, committed, readState }
}
