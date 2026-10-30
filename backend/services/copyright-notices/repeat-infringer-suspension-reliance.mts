import type { TransactionQuery } from '@data-stores/psql'
import sql from 'sql-template-strings'

/** Publication/account lifetime and final-user-purge locks are already held by the review writer. */
export async function recordCopyrightSuspensionReliance(
  query: TransactionQuery,
  input: {
    accountId: string
    outcome: 'restrict' | 'terminate'
    incidentIds: readonly string[]
  },
): Promise<void> {
  if (input.incidentIds.length !== 2)
    throw new Error('Copyright suspension requires exactly two proven incident sources')
  const { rows } = await query(sql`/* retainCurrentCopyrightSuspensionAuthority */
    SELECT 1 FROM copyright_account_suspension_reliances
    WHERE account_user_id = ${input.accountId} AND outcome = 'terminate'
      AND reinstated_at IS NULL AND released_at IS NULL AND ${input.outcome} = 'restrict'`)
  if (rows.length) return
  // ast-grep-ignore: no-three-sequential-awaits -- Replace old incident provenance, then its current authority, then the new exact incident FK set atomically in this transaction.
  await query(sql`/* replaceCopyrightSuspensionProvenance */ DELETE FROM copyright_account_suspension_incidents
    WHERE account_user_id = ${input.accountId}`)
  await query(sql`/* recordCopyrightSuspensionAuthority */
    INSERT INTO copyright_account_suspension_reliances (
      account_user_id, outcome
    ) VALUES (${input.accountId}, ${input.outcome})
    ON CONFLICT (account_user_id) DO UPDATE SET
      outcome = EXCLUDED.outcome, reinstated_at = NULL, released_at = NULL`)
  await query(sql`/* recordCopyrightSuspensionProvenance */
    INSERT INTO copyright_account_suspension_incidents (account_user_id, copyright_repeat_infringer_incident_id)
    SELECT ${input.accountId}::uuid, id FROM unnest(${[...input.incidentIds]}::uuid[]) source(id)`)
}
