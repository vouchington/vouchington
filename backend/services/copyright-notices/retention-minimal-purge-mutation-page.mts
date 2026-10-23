import type { TransactionQuery } from '@data-stores/psql/types'
import sql from 'sql-template-strings'

export type MutationPage = {
  scanned: number
  processed: number
  last_sequence: string | null
  open_delta: number
  unpurged_delta: number
  latest_clock: Date | null
}

/** Superseded user mutations collapse into the one current user sequence and current hold facts. */
export async function scanCopyrightMinimalPurgeMutations(
  query: TransactionQuery,
  noticeId: string,
  afterSequence: string,
  currentSequence: string,
  pageSize: number,
): Promise<MutationPage> {
  await query(sql`/* scopeCopyrightMinimalMutationProofUpdate */
    SELECT set_config('app.copyright_minimal_purge_notice_id', ${noticeId}, true),
      set_config('app.copyright_minimal_purge_proof_update', 'on', true)`)
  const { rows } = await query<MutationPage>(sql`/* scanCopyrightMinimalPurgeMutations */
    WITH candidate AS MATERIALIZED (
      SELECT identity.id, identity.legal_retention_mutation_sequence AS sequence
      FROM retained_user_identities identity
      WHERE identity.legal_retention_mutation_sequence > ${afterSequence}::bigint
        AND identity.legal_retention_mutation_sequence <= ${currentSequence}::bigint
      ORDER BY identity.legal_retention_mutation_sequence, identity.id
      LIMIT ${pageSize + 1}
    ), selected AS MATERIALIZED (
      SELECT id, sequence FROM candidate ORDER BY sequence, id LIMIT ${pageSize}
    ), facts AS MATERIALIZED (
      SELECT selected.id AS account_user_id, party.proof_has_open_hold AS previous_open_hold,
        party.proof_has_unpurged_incident_account AS previous_incident_unpurged,
        EXISTS (SELECT 1 FROM user_legal_preservation_holds hold
          WHERE hold.account_user_id = selected.id AND hold.released_at IS NULL)
          AS has_open_hold,
        (SELECT hold.released_at FROM user_legal_preservation_holds hold
          WHERE hold.account_user_id = selected.id AND hold.released_at IS NOT NULL
          ORDER BY hold.released_at DESC LIMIT 1) AS last_released_at,
        CASE WHEN party.is_repeat_infringer_account THEN identity.purged_at END AS purged_at,
        party.is_repeat_infringer_account AND identity.purged_at IS NULL AS incident_unpurged
      FROM selected JOIN copyright_notice_retained_parties party
        ON party.copyright_notice_identity_id = ${noticeId} AND party.account_user_id = selected.id
      JOIN retained_user_identities identity ON identity.id = selected.id
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
      (SELECT sequence FROM selected ORDER BY sequence DESC LIMIT 1) AS last_sequence,
      (SELECT COALESCE(sum(has_open_hold::integer
        - COALESCE(previous_open_hold, false)::integer), 0) FROM facts)::integer AS open_delta,
      (SELECT COALESCE(sum(incident_unpurged::integer
        - COALESCE(previous_incident_unpurged, false)::integer), 0) FROM facts)::integer
        AS unpurged_delta,
      (SELECT max(GREATEST(last_released_at, purged_at)) FROM facts) AS latest_clock`)
  return rows[0]!
}
