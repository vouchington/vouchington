import { readCopyrightAssessmentPointers } from '@voucha/test-helpers/copyright-form-review-assessment-race'
import { createRetentionParsedEmail } from '@voucha/test-helpers/services/copyright-notices/retention-parsed-email'
import { readCopyrightIntakeRetentionState } from '@voucha/test-helpers/copyright-email-retention-state'
import { linkTestCopyrightEmailIntake } from '@voucha/test-helpers/copyright-operational-email-retention'
import { describe, expect, it } from 'vitest'
import { createTestUser } from '@voucha/test-helpers'
import { holdCopyrightCaseAfterPurgeProof } from '@voucha/test-helpers/copyright-case-hold-interleave'
import {
  createCopyrightNoticeForManualAssociation,
  markTestCopyrightNoticeErasedAndCommit,
  isTestCopyrightCaseEvidenceErased,
} from '@voucha/test-helpers/copyright-email-manual-association'
import { addCopyrightCasePurgeFixtureParty } from '@voucha/test-helpers/services/copyright-notices/retention-case-purge-fixture'
import { appendTestCopyrightNoticeSubmission } from '@voucha/test-helpers/copyright-notice-submissions'
import { getCopyrightNoticePrivateAggregate } from '@voucha/test-helpers/services/copyright-notices/private-aggregate'
import { linkCopyrightEmailIntakeToNotice } from '@voucha/test-helpers/copyright-email-intake-link'
import { eraseTestCopyrightEmailIntakeOriginal } from '@voucha/test-helpers/copyright-email-intake-retention'
import { readCopyrightEmailIntakeNoticeLinks } from '@voucha/test-helpers/data-stores/psql/copyright-email-intakes'
import { PASSING_COPYRIGHT_EMAIL_SES_VERDICTS } from '@voucha/test-helpers/services/copyright-notices/email-ses-verdicts'
import {
  placeUserPreservationHold,
  releaseUserPreservationHold,
} from '../users/preservation-holds.mts'
import { createCopyrightEmailIntake } from './email-intakes.mts'
import { appendCopyrightSubmissionAssessment } from './compliance.mts'
import {
  COPYRIGHT_CASE_PURGE_PHASES,
  COPYRIGHT_CASE_EMAIL_LINK_PHASE_INDEX,
} from '@data-stores/psql/copyright-case-purge-order'
import { runCopyrightCasePurgePage } from './retention-case-purge-page.mts'

const purgeNow = new Date('2100-01-01T12:00:00.000Z')

describe('account preservation at destructive copyright page admission', () => {
  it('rolls back a lifecycle child page when an account hold commits after final SQL admission', async () => {
    const admin = await createTestUser({ administrator: true, extraRoles: ['moderator'] })
    const party = await createTestUser()
    const noticeId = await createCopyrightNoticeForManualAssociation()
    await addCopyrightCasePurgeFixtureParty(noticeId, party.id)
    const submission = await appendTestCopyrightNoticeSubmission({
      noticeId,
      kind: 'notice',
      sourceKind: 'staff',
      submittedByUserId: admin.id,
      receivedAt: new Date(),
      bodyCiphertext: 'Held lifecycle child.',
    })
    await appendCopyrightSubmissionAssessment({
      submissionId: submission.id,
      currentUser: admin,
      assessedAt: new Date(),
      substantiallyCompliant: true,
    })
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
      purgeNow,
    )
    const phaseIndex = COPYRIGHT_CASE_PURGE_PHASES.findIndex(
      phase => phase[0] === 'copyright_notice_lifecycle_changes',
    )
    const before = await getCopyrightNoticePrivateAggregate(noticeId)
    expect(before!.lifecycleEvents.length).toBeGreaterThan(0)
    let holdPlaced = false
    try {
      await expect(
        holdCopyrightCaseAfterPurgeProof(
          noticeId,
          async () => {
            await placeUserPreservationHold(admin, party.id, 'after-final-SQL-admission')
            holdPlaced = true
          },
          () =>
            runCopyrightCasePurgePage(
              { ...first.data, phase: 'children', phaseIndex, afterId: null },
              purgeNow,
            ),
          'readCopyrightCaseDestructionPreservation',
        ),
      ).rejects.toMatchObject({ code: '40001' })
      expect(holdPlaced).toBe(true)
      expect(await getCopyrightNoticePrivateAggregate(noticeId)).toEqual(before)
      const nextTick = await runCopyrightCasePurgePage(
        { ...first.data, phase: 'children', phaseIndex, afterId: null },
        purgeNow,
      )
      expect(nextTick).toMatchObject({ hasMore: true, deferred: true })
      expect(await getCopyrightNoticePrivateAggregate(noticeId)).toEqual(before)
    } finally {
      if (holdPlaced) await releaseUserPreservationHold(admin, party.id)
    }
  })

  it('rolls back a nested attachment leaf when an account hold commits after final admission', async () => {
    const admin = await createTestUser({ administrator: true, extraRoles: ['moderator'] })
    const party = await createTestUser()
    const noticeId = await createCopyrightNoticeForManualAssociation()
    await addCopyrightCasePurgeFixtureParty(noticeId, party.id)
    const intake = await createRetentionParsedEmail('held-nested-leaf', {
      replyReferences: [`<${crypto.randomUUID()}@example.test>`],
    })
    await linkTestCopyrightEmailIntake(intake.id, noticeId, 'thread', admin.id)
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
      purgeNow,
    )
    const phaseIndex = COPYRIGHT_CASE_PURGE_PHASES.findIndex(
      phase => phase[0] === 'copyright_notice_email_intake_attachments',
    )
    const before = await readCopyrightIntakeRetentionState(intake.id)
    expect(before.attachmentCount).toBe(1)
    let holdPlaced = false
    try {
      await expect(
        holdCopyrightCaseAfterPurgeProof(
          noticeId,
          async () => {
            await placeUserPreservationHold(admin, party.id, 'after-nested-leaf-admission')
            holdPlaced = true
          },
          () =>
            runCopyrightCasePurgePage(
              { ...first.data, phase: 'children', phaseIndex, afterId: null },
              purgeNow,
            ),
          'readCopyrightCaseDestructionPreservation',
        ),
      ).rejects.toMatchObject({ code: '40001' })
      expect(holdPlaced).toBe(true)
      expect(await readCopyrightIntakeRetentionState(intake.id)).toEqual(before)
      const nextTick = await runCopyrightCasePurgePage(
        { ...first.data, phase: 'children', phaseIndex, afterId: null },
        purgeNow,
      )
      expect(nextTick).toMatchObject({ hasMore: true, deferred: true })
      expect(await readCopyrightIntakeRetentionState(intake.id)).toEqual(before)
    } finally {
      if (holdPlaced) await releaseUserPreservationHold(admin, party.id)
    }
  })

  it.each(['pointers', 'children', 'email_links', 'final'] as const)(
    'rolls back %s when a hold commits after final admission',
    async branch => {
      const admin = await createTestUser({ administrator: true, extraRoles: ['moderator'] })
      const party = await createTestUser()
      const noticeId = await createCopyrightNoticeForManualAssociation()
      await addCopyrightCasePurgeFixtureParty(noticeId, party.id)
      if (branch === 'pointers' || branch === 'children') {
        const submission = await appendTestCopyrightNoticeSubmission({
          noticeId,
          kind: 'notice',
          sourceKind: 'staff',
          submittedByUserId: admin.id,
          receivedAt: new Date(),
          bodyCiphertext: 'Owned retained decision.',
        })
        await appendCopyrightSubmissionAssessment({
          submissionId: submission.id,
          currentUser: admin,
          assessedAt: new Date(),
          substantiallyCompliant: true,
        })
      }
      let intakeId: string | undefined
      if (branch === 'email_links') {
        const sesMessageId = crypto.randomUUID()
        const { intake } = await createCopyrightEmailIntake({
          sesMessageId,
          receivedAt: new Date(),
          rawStorageKey: `email/${sesMessageId}/original.eml`,
          rawSha256: Buffer.alloc(32, 4),
          rawMimeType: 'message/rfc822',
          rawByteSize: 24,
          sesVerdicts: PASSING_COPYRIGHT_EMAIL_SES_VERDICTS,
        })
        intakeId = intake.id
        if (!(await linkCopyrightEmailIntakeToNotice({ intakeId, noticeId, linkKind: 'thread' })))
          throw new Error('Owned thread-link fixture was not inserted')
        // The linked private children and original have already drained before this phase.
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
        purgeNow,
      )
      const before = {
        aggregate: await getCopyrightNoticePrivateAggregate(noticeId),
        links: intakeId ? await readCopyrightEmailIntakeNoticeLinks(intakeId) : null,
        pointers: await readCopyrightAssessmentPointers(noticeId),
      }
      expect(before.aggregate).not.toBeNull()
      expect(before.pointers.some(row => row.current_assessment_identity_id !== null)).toBe(
        branch === 'pointers' || branch === 'children',
      )
      const childIndex = COPYRIGHT_CASE_PURGE_PHASES.findIndex(
        phase => phase[0] === 'copyright_notice_lifecycle_changes',
      )
      expect(childIndex).toBeGreaterThanOrEqual(0)
      const phase = branch === 'email_links' ? 'children' : branch
      const phaseIndex =
        branch === 'pointers'
          ? 1
          : branch === 'children'
            ? childIndex
            : branch === 'email_links'
              ? COPYRIGHT_CASE_EMAIL_LINK_PHASE_INDEX
              : 0
      let holdPlaced = false
      try {
        const attempted = holdCopyrightCaseAfterPurgeProof(
          noticeId,
          async () => {
            await placeUserPreservationHold(admin, party.id, `before-${branch}-admission`)
            holdPlaced = true
          },
          () =>
            runCopyrightCasePurgePage(
              { ...first.data, phase, phaseIndex, afterId: null },
              purgeNow,
            ),
          'readCopyrightCaseDestructionPreservation',
        )
        await expect(attempted).rejects.toMatchObject({ code: '40001' })
        expect(holdPlaced).toBe(true)
        const nextTick = await runCopyrightCasePurgePage(
          { ...first.data, phase, phaseIndex, afterId: null },
          purgeNow,
        )
        expect(nextTick).toMatchObject({ hasMore: true, deferred: true })
        expect({
          aggregate: await getCopyrightNoticePrivateAggregate(noticeId),
          links: intakeId ? await readCopyrightEmailIntakeNoticeLinks(intakeId) : null,
          pointers: await readCopyrightAssessmentPointers(noticeId),
        }).toEqual(before)
        expect(await isTestCopyrightCaseEvidenceErased(noticeId)).toBe(true)
      } finally {
        if (holdPlaced) await releaseUserPreservationHold(admin, party.id)
      }
    },
  )
})
