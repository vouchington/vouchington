import { describe, expect, it } from 'vitest'
import { createTestUser } from '@voucha/test-helpers'
import { createTestTerritorialRestrictionScene } from '@voucha/test-helpers/copyright-territorial-restriction-fixtures'
import {
  admitTestGuestTerritorialComplaintEmail,
  createTestThreadedTerritorialComplaintEmail,
  readTestTerritorialComplaintEmailRecords,
} from '@voucha/test-helpers/copyright-territorial-complaint-email'
import { createTestEuParticipantCase } from '@voucha/test-helpers/copyright-eu-participant-cases'
import { createTestGuestEuCase } from '@voucha/test-helpers/copyright-eu-guest-cases'
import { createTestHistoricalEuDecisionWindow } from '@voucha/test-helpers/copyright-territorial-historical-window'
import { useCopyrightIntakeEnvironment } from '@voucha/test-helpers/services/copyright-notices/intake-environment'
import { admitCopyrightEmailCorrespondence, rejectCopyrightEmailCorrespondence } from './index.mts'

describe('territorial complaint email admission', () => {
  useCopyrightIntakeEnvironment()

  it('admits one guest complaint with null requester and preserves the inbound received_at', async () => {
    const scene = await createTestGuestEuCase('decided')
    const { email, admitted } = await admitTestGuestTerritorialComplaintEmail({
      currentUser: scene.staff,
      noticeId: scene.noticeId,
      senderEmail: scene.email,
    })
    expect(admitted.noticeId).toBe(scene.noticeId)
    const records = await readTestTerritorialComplaintEmailRecords(scene.noticeId)
    expect(records.requests).toHaveLength(1)
    expect(records.requests[0]).toMatchObject({ submitted_by_user_id: null })
    expect(records.requests[0]?.received_at.getTime()).toBe(email.receivedAt.getTime())
    expect(records.submissions).toEqual([
      expect.objectContaining({
        id: admitted.submissionId,
        kind: 'complaint',
        received_at: email.receivedAt,
      }),
    ])

    await expect(
      admitTestGuestTerritorialComplaintEmail({
        currentUser: scene.staff,
        noticeId: scene.noticeId,
        senderEmail: scene.email,
      }),
    ).rejects.toMatchObject({ status: 409 })
    await expect(readTestTerritorialComplaintEmailRecords(scene.noticeId)).resolves.toMatchObject({
      requests: [{ submitted_by_user_id: null }],
      submissions: [{ id: admitted.submissionId, kind: 'complaint' }],
    })
  })

  it('uses inbound received_at at the six-month cutoff even when staff admits it later', async () => {
    const staff = await createTestUser({ extraRoles: ['moderator'] })
    const timelyCase = await createTestHistoricalEuDecisionWindow()
    const { email: timelyEmail, admitted } = await admitTestGuestTerritorialComplaintEmail({
      currentUser: staff,
      noticeId: timelyCase.noticeId,
      senderEmail: timelyCase.notifierEmail,
      receivedAt: new Date(timelyCase.windowEndsAt.getTime() - 1_000),
    })
    const timelyRecords = await readTestTerritorialComplaintEmailRecords(timelyCase.noticeId)
    expect(timelyRecords.requests).toMatchObject([
      { submitted_by_user_id: null, received_at: timelyEmail.receivedAt },
    ])
    expect(timelyRecords.submissions).toMatchObject([
      { id: admitted.submissionId, kind: 'complaint', received_at: timelyEmail.receivedAt },
    ])

    const lateCase = await createTestHistoricalEuDecisionWindow()
    const lateReceivedAt = new Date(lateCase.windowEndsAt.getTime() + 1_000)
    await expect(
      admitTestGuestTerritorialComplaintEmail({
        currentUser: staff,
        noticeId: lateCase.noticeId,
        senderEmail: lateCase.notifierEmail,
        receivedAt: lateReceivedAt,
      }),
    ).rejects.toMatchObject({ status: 422 })
    await expect(readTestTerritorialComplaintEmailRecords(lateCase.noticeId)).resolves.toEqual({
      requests: [],
      submissions: [],
    })
  })

  it('rejects account, non-EU, and undecided cases and records no complaint for a rejected email', async () => {
    const accountCase = await createTestEuParticipantCase('no_action')
    const accountEmail = await createTestThreadedTerritorialComplaintEmail({
      noticeId: accountCase.receipt.notice_id,
      senderEmail: `notifier-${accountCase.suffix}@example.test`,
    })
    await expect(
      admitCopyrightEmailCorrespondence({
        currentUser: accountCase.staff,
        intakeId: accountEmail.intake.id,
        kind: 'complaint',
        targetIds: [],
        structuredSubmission: { summary: 'Please review.' },
        rationale: 'An account notifier must use the signed-in complaint flow.',
        recommendationId: null,
        manualFallbackReason: 'No agent recommendation was available.',
      }),
    ).rejects.toMatchObject({ status: 409 })
    await expect(
      readTestTerritorialComplaintEmailRecords(accountCase.receipt.notice_id),
    ).resolves.toEqual({ requests: [], submissions: [] })

    const uk = await createTestTerritorialRestrictionScene('uk')
    const nonEuEmail = await createTestThreadedTerritorialComplaintEmail({
      noticeId: uk.noticeId,
      senderEmail: uk.claimantContact,
    })
    await expect(
      admitCopyrightEmailCorrespondence({
        currentUser: uk.staff,
        intakeId: nonEuEmail.intake.id,
        kind: 'complaint',
        targetIds: [],
        structuredSubmission: { summary: 'Please review.' },
        rationale: 'This email path is limited to EU guest notifier complaints.',
        recommendationId: null,
        manualFallbackReason: 'No agent recommendation was available.',
      }),
    ).rejects.toMatchObject({ status: 422 })
    await expect(readTestTerritorialComplaintEmailRecords(uk.noticeId)).resolves.toEqual({
      requests: [],
      submissions: [],
    })

    const pending = await createTestGuestEuCase('pending')
    const undecidedEmail = await createTestThreadedTerritorialComplaintEmail({
      noticeId: pending.noticeId,
      senderEmail: pending.email,
    })
    await expect(
      admitCopyrightEmailCorrespondence({
        currentUser: pending.staff,
        intakeId: undecidedEmail.intake.id,
        kind: 'complaint',
        targetIds: [],
        structuredSubmission: { summary: 'Please review.' },
        rationale: 'A complaint requires an informed decision.',
        recommendationId: null,
        manualFallbackReason: 'No agent recommendation was available.',
      }),
    ).rejects.toMatchObject({ status: 422 })
    await expect(readTestTerritorialComplaintEmailRecords(pending.noticeId)).resolves.toEqual({
      requests: [],
      submissions: [],
    })

    const rejected = await createTestGuestEuCase('decided')
    const rejectedEmail = await createTestThreadedTerritorialComplaintEmail({
      noticeId: rejected.noticeId,
      senderEmail: rejected.email,
    })
    await expect(
      rejectCopyrightEmailCorrespondence({
        currentUser: rejected.staff,
        intakeId: rejectedEmail.intake.id,
        kind: 'complaint',
        rationale: 'The email does not make a complaint request.',
        recommendationId: null,
        manualFallbackReason: 'The original message was not a complaint.',
      }),
    ).resolves.toMatchObject({ noticeId: rejected.noticeId, isDuplicate: false })
    await expect(readTestTerritorialComplaintEmailRecords(rejected.noticeId)).resolves.toEqual({
      requests: [],
      submissions: [],
    })
  })
})
