import type { OwnedTransaction } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { copyrightPlacementPartiesSql } from '@services/media-delivery-safety/copyright-placement-parties'

export async function recordCopyrightRepeatInfringerTargetProvenance(
  noticeId: string,
  transaction: OwnedTransaction,
): Promise<void> {
  const statement = sql`
    /* recordCopyrightRepeatInfringerTargetProvenance */
    WITH eligible_targets AS (
      SELECT target.*
      FROM copyright_notice_targets target
      JOIN copyright_restrictions restriction
        ON restriction.copyright_notice_target_id = target.id
      WHERE target.copyright_notice_id = ${noticeId}
        AND (
          restriction.human_review_action = 'confirm'
          OR EXISTS (
            SELECT 1 FROM copyright_notice_appeal_reviews review
            WHERE review.copyright_restriction_id = restriction.id AND review.action = 'confirm'
          )
        )
    ), current_target_owners AS (
      SELECT DISTINCT target.id AS copyright_notice_target_id,
        party.user_id AS account_user_id
      FROM eligible_targets target
      CROSS JOIN LATERAL `
  statement.append(copyrightPlacementPartiesSql('strike'))
  statement.append(sql` party
      UNION
      SELECT target.id, party.user_id
      FROM eligible_targets target
      CROSS JOIN LATERAL `)
  statement.append(copyrightPlacementPartiesSql('retain'))
  statement.append(sql` party
    )
    INSERT INTO copyright_repeat_infringer_incident_targets (
      copyright_notice_id,
      copyright_repeat_infringer_incident_id,
      copyright_notice_target_id
    )
    SELECT incident.copyright_notice_id, incident.id, owner.copyright_notice_target_id
    FROM current_target_owners owner
    JOIN copyright_repeat_infringer_incidents incident
      ON incident.account_user_id = owner.account_user_id
      AND incident.copyright_notice_id = ${noticeId}
    ON CONFLICT DO NOTHING
  `)
  await transaction(statement)
}
