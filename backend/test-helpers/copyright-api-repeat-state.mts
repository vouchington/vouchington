import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { decryptSecret } from '@modules/token-secrets'
import { readCopyrightApiRetentionState } from './copyright-api-preservation-outcome.mts'

/** All owned incidents, provenance, account tips/history, case legal facts/clocks and suspension state. */
export async function readApiRepeatState(accountId: string, noticeIds: string[]) {
  const [
    cases,
    { rows: incidents },
    { rows: provenance },
    { rows: account },
    { rows: identities },
    { rows: dispositions },
    { rows: reviews },
    { rows: users },
  ] = await Promise.all([
    Promise.all(noticeIds.map(readCopyrightApiRetentionState)),
    write<{ id: string; copyright_notice_id: string; is_operative: boolean }>(
      sql`/* readApiRepeatState:incidents */ SELECT * FROM copyright_repeat_infringer_incidents WHERE account_user_id = ${accountId} ORDER BY id`,
    ),
    write(
      sql`/* readApiRepeatState:provenance */ SELECT provenance.* FROM copyright_repeat_infringer_incident_targets provenance JOIN copyright_repeat_infringer_incidents incident ON incident.id = provenance.copyright_repeat_infringer_incident_id WHERE incident.account_user_id = ${accountId} ORDER BY provenance.copyright_notice_id,provenance.copyright_notice_target_id`,
    ),
    write<{
      current_open_review_identity_id: string | null
      current_decided_review_identity_id: string | null
      current_outcome_rationale_ciphertext: string | null
    }>(
      sql`/* readApiRepeatState:account */ SELECT * FROM copyright_repeat_infringer_account_states WHERE account_user_id = ${accountId}`,
    ),
    write<{ id: string; created_at: Date }>(
      sql`/* readApiRepeatState:identities */ SELECT * FROM copyright_repeat_infringer_review_identities WHERE account_user_id = ${accountId} ORDER BY id`,
    ),
    write<{
      id: string
      copyright_repeat_infringer_incident_id: string
      rationale_ciphertext: string
      matchesCurrent: boolean
    }>(sql`/* readApiRepeatState:dispositions */ SELECT disposition.*,
      (disposition.disposition = incident.current_disposition AND disposition.recorded_at = incident.current_disposition_recorded_at AND disposition.recorded_by_id = incident.current_disposition_recorded_by_id) AS "matchesCurrent"
      FROM copyright_repeat_infringer_dispositions disposition JOIN copyright_repeat_infringer_incidents incident ON incident.id = disposition.copyright_repeat_infringer_incident_id WHERE incident.account_user_id = ${accountId} ORDER BY disposition.id`),
    write<{
      id: string
      copyright_repeat_infringer_review_identity_id: string
      rationale_ciphertext: string
      matchesCurrent: boolean
    }>(sql`/* readApiRepeatState:reviews */ SELECT review.*,
      (review.copyright_repeat_infringer_review_identity_id = state.current_decided_review_identity_id AND review.outcome = state.current_outcome AND review.outcome_at = state.current_outcome_at AND review.outcome_by_id = state.current_outcome_by_id AND review.rationale_ciphertext = state.current_outcome_rationale_ciphertext) AS "matchesCurrent"
      FROM copyright_repeat_infringer_reviews review JOIN copyright_repeat_infringer_account_states state ON state.account_user_id = review.account_user_id WHERE review.account_user_id = ${accountId} ORDER BY review.id`),
    write(
      sql`/* readApiRepeatState:user */ SELECT account.id,account.deleted_at,
      ARRAY(SELECT suspension.id FROM user_suspensions suspension WHERE suspension.user_id = account.id AND suspension.lifted_at IS NULL ORDER BY suspension.id) AS active_suspension_ids,
      COALESCE((SELECT jsonb_agg(to_jsonb(suspension) ORDER BY suspension.id) FROM user_suspensions suspension WHERE suspension.user_id = account.id), '[]'::jsonb) AS suspensions
      FROM users account WHERE account.id = ${accountId}`,
    ),
  ])
  return {
    cases,
    incidents,
    provenance,
    identities,
    users,
    account: account.map(row => ({
      ...row,
      current_outcome_rationale_ciphertext: row.current_outcome_rationale_ciphertext
        ? decryptSecret(
            row.current_outcome_rationale_ciphertext,
            `copyright-repeat-infringer-review:${row.current_decided_review_identity_id}`,
          )
        : null,
    })),
    dispositions: dispositions.map(row => ({
      ...row,
      rationale_ciphertext: decryptSecret(
        row.rationale_ciphertext,
        `copyright-repeat-infringer-disposition:${row.copyright_repeat_infringer_incident_id}`,
      ),
    })),
    reviews: reviews.map(row => ({
      ...row,
      rationale_ciphertext: decryptSecret(
        row.rationale_ciphertext,
        `copyright-repeat-infringer-review:${row.copyright_repeat_infringer_review_identity_id}`,
      ),
    })),
  }
}
