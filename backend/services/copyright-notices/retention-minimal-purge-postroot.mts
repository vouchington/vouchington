import type { CopyrightMinimalPurgePageResult } from './retention-minimal-purge-types.mts'
import { readCopyrightMinimalPurgePhysicalRows } from './retention-minimal-purge-deletions.mts'
import type { TransactionQuery } from '@data-stores/psql/types'
import sql from 'sql-template-strings'

/** The root is already gone; retain party relations until their own capped pages finish. */
export async function drainCopyrightMinimalPurgePostroot(
  transaction: TransactionQuery,
  noticeId: string,
  pageSize: number,
  rootPurgedAt: Date | null | undefined,
  remainingPhysicalRows: number,
): Promise<CopyrightMinimalPurgePageResult> {
  if (!rootPurgedAt) return { outcome: 'ineligible', physicalRows: 0 }
  const rawLimit = Math.min(pageSize, remainingPhysicalRows)
  await transaction(sql`/* scopeCopyrightMinimalPurgePartyDrain */
    SELECT set_config('app.copyright_minimal_purge_notice_id', ${noticeId}, true),
      set_config('app.copyright_minimal_purge_phase_table', 'copyright_account_suspension_reliances', true),
      set_config('app.copyright_minimal_purge_physical_count', '0', true),
      set_config('app.copyright_minimal_purge_delete_limit', ${String(remainingPhysicalRows)}, true)`)
  // Spend one shared row budget on released authority and then its party edges.
  // At cap one, the authority goes first and its party remains for the next call.
  const { rows: page } = await transaction<{ scanned: number; deleted: number }>(sql`
    /* drainCopyrightMinimalPurgeRetainedParties */
    WITH candidate AS MATERIALIZED (
      SELECT party.ctid, party.account_user_id FROM copyright_notice_retained_parties party
      WHERE party.copyright_notice_identity_id = ${noticeId}
      ORDER BY party.account_user_id LIMIT ${rawLimit + 1}
    ), selected AS MATERIALIZED (
      SELECT ctid, account_user_id FROM candidate ORDER BY account_user_id LIMIT ${rawLimit}
    ), deleted_reliances AS (
      DELETE FROM copyright_account_suspension_reliances reliance USING selected
      WHERE reliance.account_user_id = selected.account_user_id
        AND reliance.released_at IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM copyright_account_suspension_incidents source
          WHERE source.account_user_id = reliance.account_user_id)
      RETURNING reliance.account_user_id
    ), selected_parties AS MATERIALIZED (
      SELECT ctid FROM selected ORDER BY account_user_id
      LIMIT (${rawLimit} - (SELECT count(*) FROM deleted_reliances))
    ),
    deleted AS (DELETE FROM copyright_notice_retained_parties party USING selected_parties
      WHERE party.ctid = selected_parties.ctid
        AND party.copyright_notice_identity_id = ${noticeId} RETURNING 1)
    SELECT (SELECT count(*) FROM candidate)::integer AS scanned,
      ((SELECT count(*) FROM deleted_reliances) + (SELECT count(*) FROM deleted))::integer AS deleted`)
  if (page[0]?.scanned) {
    if (page[0].deleted === 0 || page[0].deleted > rawLimit)
      throw new Error('Copyright retained-party drain failed its page bound')
    return {
      outcome: 'progress',
      physicalRows: await readCopyrightMinimalPurgePhysicalRows(transaction),
    }
  }
  if (remainingPhysicalRows < 2) return { outcome: 'progress', physicalRows: 0, requiredRows: 2 }
  await transaction(sql`/* completeCopyrightMinimalPurgeWork */
    DELETE FROM copyright_notice_minimal_purge_continuations
    WHERE copyright_notice_identity_id = ${noticeId} AND root_purged_at IS NOT NULL`)
  await transaction(sql`/* releaseCopyrightRetainedCaseIdentity */
    DELETE FROM copyright_notice_retained_identities identity
    WHERE identity.id = ${noticeId}`)
  return {
    outcome: 'purged',
    physicalRows: await readCopyrightMinimalPurgePhysicalRows(transaction),
  }
}
