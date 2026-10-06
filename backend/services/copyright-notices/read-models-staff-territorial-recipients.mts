import type { TransactionQuery } from '@data-stores/psql/types'
import { copyrightPlacementPartiesSql } from '@services/media-delivery-safety/copyright-placement-parties'
import sql from 'sql-template-strings'
import { copyrightDecisionDeliveryKinds } from './delivery-types.mts'

export type CopyrightTerritorialStaffRecipient = {
  role: 'claimant' | 'poster'
  user_id: string | null
  informed_at: Date | null
  state: 'pending' | 'claimed' | 'sent' | 'failed' | 'bounced' | null
}

export async function selectTerritorialStaffRecipients(
  noticeId: string,
  decisionId: string | null,
  decidedAt: Date | null,
  query: TransactionQuery,
): Promise<CopyrightTerritorialStaffRecipient[]> {
  if (!decisionId || !decidedAt) return []
  const statement = sql`/* selectTerritorialStaffRecipients */
    WITH recipients AS (
      SELECT 'claimant'::text AS role, receipt.requester_user_id AS user_id
      FROM copyright_territorial_notice_receipts receipt
      WHERE receipt.copyright_notice_id = ${noticeId}
      UNION
      SELECT 'poster'::text AS role, party.user_id
      FROM copyright_notice_targets target
      CROSS JOIN LATERAL `
  statement.append(copyrightPlacementPartiesSql('notify'))
  statement.append(sql` party
      WHERE target.copyright_notice_id = ${noticeId}
        AND EXISTS (SELECT 1 FROM copyright_territorial_decisions decision
          WHERE decision.id = ${decisionId} AND decision.outcome = 'restrict')
    )
    SELECT recipient.role, recipient.user_id,
      MIN(intent.sent_at) FILTER (WHERE intent.state = 'sent' AND intent.sent_at >= ${decidedAt}) AS informed_at,
      (array_agg(intent.state ORDER BY intent.id DESC))[1] AS state
    FROM recipients recipient
    LEFT JOIN copyright_notice_delivery_work_items intent
      ON intent.copyright_notice_id = ${noticeId}
      AND intent.recipient_role::text = recipient.role
      AND (recipient.role = 'claimant' OR intent.recipient_user_id = recipient.user_id)
      AND intent.delivery_kind = (CASE recipient.role
        WHEN 'claimant' THEN ${copyrightDecisionDeliveryKinds[1]}
        ELSE ${copyrightDecisionDeliveryKinds[0]} END)::copyright_notice_delivery_kinds
      AND (intent.created_at >= ${decidedAt} OR intent.sent_at >= ${decidedAt})
    GROUP BY recipient.role, recipient.user_id
    ORDER BY recipient.role, recipient.user_id
  `)
  const { rows } = await query<CopyrightTerritorialStaffRecipient>(statement)
  return rows
}
