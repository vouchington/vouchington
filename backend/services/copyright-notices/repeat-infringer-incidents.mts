import type { OwnedTransaction } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { lockCopyrightRepeatInfringerNoticeAccounts } from './repeat-infringer-locks.mts'
import {
  anyReversalSourceSql,
  statutoryRestorationSourceSql,
} from './restriction-reversal-sources-sql.mts'
import { copyrightPlacementPartiesSql } from '@data-stores/psql/copyright-placement-parties'
import { recordCopyrightRepeatInfringerTargetProvenance } from './repeat-infringer-target-provenance.mts'
import { retainCopyrightCaseIncidentParties } from './retention-parties-admission.mts'

export async function syncCopyrightRepeatInfringerIncidents(
  noticeId: string,
  transaction: OwnedTransaction,
): Promise<void> {
  const accountIds = await lockCopyrightRepeatInfringerNoticeAccounts(noticeId, transaction)
  const statement = sql`
    /* syncCopyrightRepeatInfringerIncidents */
    WITH eligible_targets AS (
      SELECT target.*,
        NOT (`
  statement.append(anyReversalSourceSql())
  statement.append(sql`) AND NOT (`)
  statement.append(statutoryRestorationSourceSql())
  statement.append(sql`) AS is_operative_restriction
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
      CROSS JOIN LATERAL `)
  statement.append(copyrightPlacementPartiesSql('strike'))
  statement.append(sql` party
    ), owners AS (
      SELECT DISTINCT owner.account_user_id
      FROM current_target_owners owner
      JOIN eligible_targets target ON target.id = owner.copyright_notice_target_id
      WHERE target.is_operative_restriction
      UNION
      SELECT incident.account_user_id
      FROM copyright_repeat_infringer_incident_targets provenance
      JOIN copyright_repeat_infringer_incidents incident
        ON incident.id = provenance.copyright_repeat_infringer_incident_id
        AND incident.copyright_notice_id = provenance.copyright_notice_id
      JOIN eligible_targets target
        ON target.id = provenance.copyright_notice_target_id
        AND target.is_operative_restriction
      WHERE provenance.copyright_notice_id = ${noticeId}
    ), desired AS (
      SELECT owners.account_user_id,
        NOT EXISTS (
          SELECT 1 FROM copyright_repeat_infringer_incidents incident
          WHERE incident.copyright_notice_id = ${noticeId}
            AND incident.account_user_id = owners.account_user_id
            AND incident.current_disposition IS NOT NULL
        ) AS is_operative
      FROM owners
    ), upserted AS (
      INSERT INTO copyright_repeat_infringer_incidents (
        account_user_id, copyright_notice_id, is_operative
      )
      SELECT account_user_id, ${noticeId}, is_operative FROM desired
      ON CONFLICT (account_user_id, copyright_notice_id) DO UPDATE
      SET is_operative = EXCLUDED.is_operative
      WHERE copyright_repeat_infringer_incidents.is_operative IS DISTINCT FROM EXCLUDED.is_operative
      RETURNING account_user_id, is_operative
    ), cleared AS (
      UPDATE copyright_repeat_infringer_incidents incident
      SET is_operative = false
      WHERE incident.copyright_notice_id = ${noticeId}
        AND incident.is_operative
        AND NOT EXISTS (
          SELECT 1 FROM desired WHERE desired.account_user_id = incident.account_user_id
        )
      RETURNING incident.account_user_id
    )
    SELECT account_user_id, is_operative FROM upserted
    UNION ALL
    SELECT account_user_id, false FROM cleared
  `)
  const { rows: changedIncidents } = await transaction<{ account_user_id: string }>(statement)
  await retainCopyrightCaseIncidentParties(
    transaction,
    noticeId,
    changedIncidents.map(row => row.account_user_id),
  )
  await recordCopyrightRepeatInfringerTargetProvenance(noticeId, transaction)
  if (accountIds.length === 0) return
  await transaction(sql`
    /* syncCopyrightRepeatInfringerIncidents:openReview */
    WITH eligible AS (
      SELECT incident.account_user_id
      FROM copyright_repeat_infringer_incidents incident
      JOIN users live_account
        ON live_account.id = incident.account_user_id AND live_account.deleted_at IS NULL
      JOIN UNNEST(${accountIds}::uuid[]) AS candidate(id)
        ON incident.account_user_id = candidate.id
      LEFT JOIN copyright_repeat_infringer_account_states account_state
        ON account_state.account_user_id = incident.account_user_id
      WHERE incident.is_operative AND account_state.current_open_review_identity_id IS NULL
      GROUP BY incident.account_user_id
      HAVING count(*) >= 2
    ), identities AS (
      INSERT INTO copyright_repeat_infringer_review_identities (account_user_id)
      SELECT account_user_id FROM eligible
      RETURNING id, account_user_id
    ), opened AS (
      INSERT INTO copyright_repeat_infringer_account_states (
        account_user_id, current_open_review_identity_id
      ) SELECT account_user_id, id FROM identities
      ON CONFLICT (account_user_id) DO UPDATE
      SET current_open_review_identity_id = EXCLUDED.current_open_review_identity_id
      WHERE copyright_repeat_infringer_account_states.current_open_review_identity_id IS NULL
      RETURNING account_user_id, current_open_review_identity_id
    ) SELECT count(*) FROM opened
  `)
}
