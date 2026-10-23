import type { TransactionQuery } from '@data-stores/psql/types'
import sql from 'sql-template-strings'

export type ProofPage = {
  scanned: number
  processed: number
  last_id: string | null
  open_delta: number
  unpurged_delta: number
  latest_clock: Date | null
}

/** Reads at most pageSize+1 indexed case parties, then one indexed hold fact per selected user. */
export async function scanCopyrightMinimalPurgeParties(
  query: TransactionQuery,
  noticeId: string,
  after: string | null,
  pageSize: number,
): Promise<ProofPage> {
  await query(sql`/* scopeCopyrightMinimalPartyProofUpdate */
    SELECT set_config('app.copyright_minimal_purge_notice_id', ${noticeId}, true),
      set_config('app.copyright_minimal_purge_proof_update', 'on', true)`)
  const { rows } = await query<ProofPage>(sql`/* scanCopyrightMinimalPurgeParties */
    WITH candidate AS MATERIALIZED (
      SELECT party.account_user_id FROM copyright_notice_retained_parties party
      WHERE party.copyright_notice_identity_id = ${noticeId}
        AND (${after}::uuid IS NULL OR party.account_user_id > ${after}::uuid)
      ORDER BY party.account_user_id LIMIT ${pageSize + 1}
    ), selected AS MATERIALIZED (
      SELECT account_user_id FROM candidate ORDER BY account_user_id LIMIT ${pageSize}
    ), facts AS MATERIALIZED (
      SELECT selected.account_user_id,
        EXISTS (SELECT 1 FROM user_legal_preservation_holds hold
          WHERE hold.account_user_id = selected.account_user_id
            AND hold.released_at IS NULL) AS has_open_hold,
        (SELECT hold.released_at FROM user_legal_preservation_holds hold
          WHERE hold.account_user_id = selected.account_user_id
            AND hold.released_at IS NOT NULL
          ORDER BY hold.released_at DESC LIMIT 1) AS last_released_at,
        CASE WHEN party.is_repeat_infringer_account THEN identity.purged_at END AS purged_at,
        party.is_repeat_infringer_account AND identity.purged_at IS NULL AS incident_unpurged
      FROM selected JOIN copyright_notice_retained_parties party
        ON party.copyright_notice_identity_id = ${noticeId}
          AND party.account_user_id = selected.account_user_id
      JOIN retained_user_identities identity ON identity.id = selected.account_user_id
    ), updated AS (
      UPDATE copyright_notice_retained_parties party
      SET proof_has_open_hold = facts.has_open_hold,
        proof_has_unpurged_incident_account = facts.incident_unpurged FROM facts
      WHERE party.copyright_notice_identity_id = ${noticeId}
        AND party.account_user_id = facts.account_user_id
      RETURNING party.account_user_id
    )
    SELECT (SELECT count(*) FROM candidate)::integer AS scanned,
      (SELECT count(*) FROM updated)::integer AS processed,
      (SELECT account_user_id FROM selected ORDER BY account_user_id DESC LIMIT 1) AS last_id,
      (SELECT count(*) FROM facts WHERE has_open_hold)::integer AS open_delta,
      (SELECT count(*) FROM facts WHERE incident_unpurged)::integer AS unpurged_delta,
      (SELECT max(GREATEST(last_released_at, purged_at)) FROM facts) AS latest_clock`)
  return rows[0]!
}
