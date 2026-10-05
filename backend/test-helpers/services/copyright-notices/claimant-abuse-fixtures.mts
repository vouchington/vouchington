import sql from 'sql-template-strings'
import { beginTransaction, write } from '@data-stores/psql'
import { checkAutomaticWithholdingCaps } from '../../../services/copyright-notices/automatic-withholding-caps.mts'
import { getPendingCopyrightStaffCase } from '../../../services/copyright-notices/read-models-staff-case.mts'

/**
 * Appends an audited change to a config key that only the calling test reads, stamped `daysAgo`
 * days in the past, so the switch-on lookup can be exercised without touching the live namespace.
 */
export async function recordTestConfigChange(
  configKey: string,
  daysAgo: number,
  previous: Record<string, unknown>,
  next: Record<string, unknown>,
): Promise<void> {
  await write(sql`/* recordTestConfigChange */
    INSERT INTO dynamic_configuration_revisions (id, configuration_key, revision_type, changes)
    VALUES (uuidv7(${`-${daysAgo} days`}::interval), ${configKey}, 'update',
      fn_field_changes(${JSON.stringify(previous)}::jsonb, ${JSON.stringify(next)}::jsonb))
  `)
}

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
  const staffCase = await getPendingCopyrightStaffCase(noticeId, transaction)
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
