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
} from './retention-case-purge-order.mts'
import { runCopyrightCasePurgePage } from './retention-case-purge-page.mts'

const purgeNow = new Date('2100-01-01T12:00:00.000Z')

describe('account preservation at destructive copyright page admission', () => {
  it.each(['pointers', 'children', 'email_links', 'final'] as const)(
    'defers %s when a hold commits after the old proof',
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
      }
      expect(before.aggregate).not.toBeNull()
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
        const result = await holdCopyrightCaseAfterPurgeProof(
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
        )
        expect(result).toMatchObject({
          hasMore: true,
          deferred: true,
          data: { phase: 'parties', phaseIndex: 0, afterId: null },
        })
        expect({
          aggregate: await getCopyrightNoticePrivateAggregate(noticeId),
          links: intakeId ? await readCopyrightEmailIntakeNoticeLinks(intakeId) : null,
        }).toEqual(before)
        expect(await isTestCopyrightCaseEvidenceErased(noticeId)).toBe(true)
      } finally {
        if (holdPlaced) await releaseUserPreservationHold(admin, party.id)
      }
    },
  )
})
