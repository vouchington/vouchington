import type { TransactionQuery } from '@data-stores/psql'
import { copyrightPlacementPartiesSql } from '@data-stores/psql/copyright-placement-parties'
import { lockRetentionPreservationAccounts } from '@data-stores/psql/retention-preservation-lock'
import sql from 'sql-template-strings'

/** Account row locks precede rationale row locks and the caller's fresh eligibility check. */
export async function lockCopyrightRationaleRetentionPage(
  transaction: TransactionQuery,
  ids: readonly string[],
): Promise<ReadonlySet<string>> {
  if (ids.length === 0) return new Set()
  await lockRetentionPreservationAccounts(transaction, rationaleRetentionAccounts(ids))
  // The destructive statement rechecks current party and hold coverage before deleting.
  const locked = await transaction<{ id: string }>(
    `/* lockCopyrightRationaleRetentionRows */
     SELECT id FROM copyright_decision_rationales
     WHERE id = ANY($1::uuid[]) ORDER BY id FOR UPDATE SKIP LOCKED`,
    [ids],
  )
  return new Set(locked.rows.map(row => row.id))
}

function rationaleRetentionAccounts(ids: readonly string[]) {
  return sql`
    SELECT COALESCE(rationale.account_user_id, review.account_user_id)
    FROM copyright_decision_rationales rationale
    LEFT JOIN copyright_repeat_infringer_review_identities review
      ON review.id = rationale.copyright_repeat_infringer_review_identity_id
    WHERE rationale.id = ANY(${ids}::uuid[])

    UNION ALL

    SELECT party.user_id
    FROM (
      SELECT rationale.copyright_notice_id AS notice_id
      FROM copyright_decision_rationales rationale WHERE rationale.id = ANY(${ids}::uuid[])
      UNION
      SELECT link.copyright_notice_id
      FROM copyright_decision_rationales rationale
      JOIN copyright_notice_email_intake_notice_links link
        ON link.copyright_notice_email_intake_id = rationale.copyright_notice_email_intake_receipt_id
      WHERE rationale.id = ANY(${ids}::uuid[])
    ) selected
    JOIN copyright_notices notice ON notice.id = selected.notice_id AND notice.jurisdiction IN ('eu_dsa', 'uk')
    CROSS JOIN LATERAL (
      SELECT identity.account_user_id AS user_id
      FROM copyright_notice_party_identities identity WHERE identity.copyright_notice_id = notice.id
      UNION ALL
      SELECT notice.claimant_user_id
      UNION ALL
      SELECT submission.submitted_by_id
      FROM copyright_notice_submissions submission WHERE submission.copyright_notice_id = notice.id
      UNION ALL
      SELECT incident.account_user_id
      FROM copyright_repeat_infringer_incidents incident WHERE incident.copyright_notice_id = notice.id
      UNION ALL
      SELECT placement_party.user_id
      FROM copyright_notice_targets target
      CROSS JOIN LATERAL `.append(copyrightPlacementPartiesSql('retain'))
    .append(sql` placement_party
      WHERE target.copyright_notice_id = notice.id
    ) party
  `)
}
