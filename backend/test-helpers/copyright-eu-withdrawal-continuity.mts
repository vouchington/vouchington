import { expect } from 'vitest'
import { assertEuWithdrawalSettlementContinuity } from './copyright-eu-withdrawal-settlement-oracle.mts'
import type { PrivateUser } from '../services/users/types.mts'
import { admitCopyrightEmailCorrespondence } from '../services/copyright-notices/email-correspondence-admission.mts'
import { createTestGuestEuCase } from './copyright-eu-guest-cases.mts'
import { createTestThreadedTerritorialComplaintEmail } from './copyright-territorial-complaint-email.mts'

/** Prepare an owned guest case before withdrawing its intake approval. */
export async function prepareTestEuWithdrawalGuestCase() {
  const scene = await createTestGuestEuCase()
  return { noticeId: scene.noticeId, notifierEmail: scene.email }
}

/** Reads and records existing-case duties. Intake closure is proved on the caller's transaction. */
export async function assertTestEuWithdrawalContinuity(input: {
  staff: PrivateUser
  notifier: PrivateUser
  restrictedNoticeId: string
  guest: Awaited<ReturnType<typeof prepareTestEuWithdrawalGuestCase>>
}) {
  await assertEuWithdrawalSettlementContinuity(input)

  const email = await createTestThreadedTerritorialComplaintEmail({
    noticeId: input.guest.noticeId,
    senderEmail: input.guest.notifierEmail,
  })
  await expect(
    admitCopyrightEmailCorrespondence({
      currentUser: input.staff,
      intakeId: email.intake.id,
      kind: 'complaint',
      targetIds: [],
      structuredSubmission: { summary: 'Please reconsider the existing decision.' },
      rationale: 'The guest asks for reconsideration after intake approval was withdrawn.',
      recommendationId: null,
      manualFallbackReason: 'No agent recommendation is available.',
    }),
  ).resolves.toMatchObject({ noticeId: input.guest.noticeId, isDuplicate: false })
}
