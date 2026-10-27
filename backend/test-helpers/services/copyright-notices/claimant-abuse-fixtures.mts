import sql from 'sql-template-strings'
import { beginTransaction, write } from '@data-stores/psql'
import { checkAutomaticWithholdingCaps } from '../../../services/copyright-notices/automatic-withholding-caps.mts'
import { readClaimantMisuseSummaries } from '../../../services/copyright-notices/claimant-misuse-summary.mts'
import { getPendingCopyrightStaffCases } from '../../../services/copyright-notices/read-models-staff-case.mts'

/** Erases the administrator on a user's suspension, as deleting that account does. */
export async function eraseTestSuspendingAdministrator(userId: string): Promise<void> {
  await write(sql`/* eraseTestSuspendingAdministrator */
    UPDATE user_suspensions SET suspended_by_id = NULL WHERE user_id = ${userId}
  `)
}

/** Unlinks the claimant account from a notice, as deleting that account does. */
export async function eraseTestCopyrightClaimantAccount(noticeId: string): Promise<void> {
  await write(sql`/* eraseTestCopyrightClaimantAccount */
    UPDATE copyright_notices SET claimant_user_id = NULL WHERE id = ${noticeId}
  `)
}

/** The claimant block of a notice's staff case, with the misuse ledger summary a moderator sees. */
export async function readTestStaffCaseClaimant(noticeId: string) {
  await using transaction = await beginTransaction()
  const staffCase = (await getPendingCopyrightStaffCases([noticeId], transaction)).get(noticeId)
  return staffCase?.claimant
}

/** Runs the automatic-withholding cap check in its own committed transaction. */
export async function checkTestAutomaticWithholdingCaps(
  input: Parameters<typeof checkAutomaticWithholdingCaps>[1],
): Promise<Awaited<ReturnType<typeof checkAutomaticWithholdingCaps>>> {
  await using transaction = await beginTransaction()
  const reason = await checkAutomaticWithholdingCaps(transaction, input)
  await transaction.commit()
  return reason
}

/** The misuse ledger summary of one claimant account, read as staff see it. */
export async function readTestClaimantMisuseSummary(claimantUserId: string) {
  return (await readClaimantMisuseSummaries([claimantUserId])).get(claimantUserId)!
}
