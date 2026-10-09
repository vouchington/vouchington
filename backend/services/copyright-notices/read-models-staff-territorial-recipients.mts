import type { TransactionQuery } from '@data-stores/psql/types'
import { copyrightPlacementPartiesSql } from '@services/media-delivery-safety/copyright-placement-parties'
import sql from 'sql-template-strings'
import { copyrightDecisionDeliveryKinds } from './delivery-types.mts'
import { groupByNotice } from './read-models-staff-group.mts'

export type CopyrightTerritorialStaffRecipient = {
  role: 'claimant' | 'poster'
  user_id: string | null
  informed_at: Date | null
  state: 'pending' | 'claimed' | 'sent' | 'failed' | 'bounced' | null
}

/** Recipients of every listed notice's live decision; a notice without a decision has none. */
export async function selectTerritorialStaffRecipients(
  decisions: ReadonlyArray<{ noticeId: string; decisionId: string; decidedAt: Date }>,
  query: TransactionQuery,
): Promise<Map<string, CopyrightTerritorialStaffRecipient[]>> {
  if (decisions.length === 0) return new Map()
  const statement = sql`/* selectTerritorialStaffRecipients */
    WITH decided AS (
      SELECT * FROM unnest(
        ${decisions.map(item => item.noticeId)}::uuid[],
        ${decisions.map(item => item.decisionId)}::uuid[],
        ${decisions.map(item => item.decidedAt)}::timestamptz[]
      ) AS listed(notice_id, decision_id, decided_at)
    ), recipients AS (
      SELECT decided.notice_id, 'claimant'::text AS role, receipt.requester_user_id AS user_id
      FROM decided
      JOIN copyright_territorial_notice_receipts receipt
        ON receipt.copyright_notice_id = decided.notice_id
      UNION
      SELECT decided.notice_id, 'poster'::text AS role, party.user_id
      FROM decided
      JOIN copyright_notice_targets target ON target.copyright_notice_id = decided.notice_id
      CROSS JOIN LATERAL `
  statement.append(copyrightPlacementPartiesSql('notify'))
  statement.append(sql` party
      WHERE EXISTS (SELECT 1 FROM copyright_territorial_decisions decision
          WHERE decision.id = decided.decision_id AND decision.outcome = 'restrict')
    )
    SELECT recipient.notice_id AS copyright_notice_id, recipient.role, recipient.user_id,
      MIN(intent.sent_at) FILTER (WHERE intent.state = 'sent' AND intent.sent_at >= decided.decided_at) AS informed_at,
      (array_agg(intent.state ORDER BY intent.id DESC))[1] AS state
    FROM recipients recipient
    JOIN decided ON decided.notice_id = recipient.notice_id
    LEFT JOIN copyright_notice_delivery_work_items intent
      ON intent.copyright_notice_id = recipient.notice_id
      AND intent.recipient_role::text = recipient.role
      AND (recipient.role = 'claimant' OR intent.recipient_user_id = recipient.user_id)
      AND intent.delivery_kind = (CASE recipient.role
        WHEN 'claimant' THEN ${copyrightDecisionDeliveryKinds[1]}
        ELSE ${copyrightDecisionDeliveryKinds[0]} END)::copyright_notice_delivery_kinds
      AND (intent.created_at >= decided.decided_at OR intent.sent_at >= decided.decided_at)
    GROUP BY recipient.notice_id, recipient.role, recipient.user_id
    ORDER BY recipient.notice_id, recipient.role, recipient.user_id
  `)
  const { rows } = await query<
    CopyrightTerritorialStaffRecipient & { copyright_notice_id: string }
  >(statement)
  return groupByNotice(rows)
}
