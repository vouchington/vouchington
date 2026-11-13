import { assertEuWithdrawalSettlementContinuity } from './copyright-eu-withdrawal-settlement-oracle.mts'
import type { PrivateUser } from '../services/users/types.mts'
import { assertEuWithdrawalEmailComplaint } from './copyright-eu-complaint-outcome.mts'
import { createTestThreadedTerritorialComplaintEmail } from './copyright-territorial-complaint-email.mts'

import { prepareTestEuWithdrawalGuestCase } from './copyright-eu-withdrawal-continuity.mts'

/** Reads and records existing-case duties. Intake closure is proved on the caller's transaction. */
export async function assertCommittedEuWithdrawalContinuity(input: {
  staff: PrivateUser
  notifier: PrivateUser
  restrictedNoticeId: string
  guest: Awaited<ReturnType<typeof prepareTestEuWithdrawalGuestCase>>
}) {
  const participantOutcome = await assertEuWithdrawalSettlementContinuity(input)

  const email = await createTestThreadedTerritorialComplaintEmail({
    noticeId: input.guest.noticeId,
    senderEmail: input.guest.notifierEmail,
  })
  await assertEuWithdrawalEmailComplaint({
    staff: input.staff,
    noticeId: input.guest.noticeId,
    intakeId: email.intake.id,
  })
  return participantOutcome
}
