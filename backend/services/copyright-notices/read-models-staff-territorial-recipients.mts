import type { TransactionQuery } from '@data-stores/psql/types'
import { copyrightPlacementPartiesSql } from '@data-stores/psql/copyright-placement-parties'
import sql from 'sql-template-strings'
import { copyrightDecisionDeliveryKinds } from './delivery-types.mts'

export type CopyrightTerritorialStaffRecipient = {
  role: 'claimant' | 'poster'
  user_id: string | null
  informed_at: Date | null
  state: 'pending' | 'claimed' | 'sent' | 'failed' | 'bounced' | null
}

// Sorts a guest poster, which has no account, ahead of the accounts of its role.
const NO_USER_ID = '00000000-0000-0000-0000-000000000000'

export function territorialRecipientCursorScope(noticeId: string, decisionId: string): string {
  return `copyright-territorial-recipients:${noticeId}:${decisionId}:role-asc-user-asc`
}

/** The cursor alias of a recipient; a guest poster has an empty user id. */
export function territorialRecipientAlias(recipient: CopyrightTerritorialStaffRecipient): string {
  return `${recipient.role}:${recipient.user_id ?? ''}`
}

/**
 * One page of the recipients of a notice's live decision, ordered by role then account. Pass the
 * decoded cursor of the previous page's last recipient as `after` to continue.
 */
export async function selectTerritorialStaffRecipients(
  decision: { noticeId: string; decisionId: string; decidedAt: Date },
  query: TransactionQuery,
  options: { limit: number; after?: { role: string; userId: string | null } },
): Promise<{ results: CopyrightTerritorialStaffRecipient[]; hasNextPage: boolean }> {
  const statement = sql`/* selectTerritorialStaffRecipients */
    WITH decided AS (
      SELECT ${decision.noticeId}::uuid AS notice_id, ${decision.decisionId}::uuid AS decision_id,
        ${decision.decidedAt}::timestamptz AS decided_at
    ), recipients AS (
      SELECT * FROM (
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
        WHERE EXISTS (SELECT 1 FROM copyright_notices notice
            WHERE notice.id = decided.notice_id
              AND notice.current_territorial_decision_identity_id = decided.decision_id
              AND notice.territorial_decision_outcome = 'restrict')
      ) candidate`)
  if (options.after) {
    statement.append(sql`
      WHERE (candidate.role, COALESCE(candidate.user_id, ${NO_USER_ID}::uuid))
        > (${options.after.role}::text, COALESCE(${options.after.userId}::uuid, ${NO_USER_ID}::uuid))`)
  }
  statement.append(sql`
      ORDER BY candidate.role, COALESCE(candidate.user_id, ${NO_USER_ID}::uuid)
      LIMIT ${options.limit + 1}
    )
    SELECT recipient.role, recipient.user_id,
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
      -- no-mistakes-disable-next-line postgres-generated-column-predicates: No SQL UUIDv7 timestamp-to-bound helper exists; the territorial decision time is the delivery cutoff.
      AND (intent.created_at >= decided.decided_at OR intent.sent_at >= decided.decided_at)
    GROUP BY recipient.role, recipient.user_id
    ORDER BY recipient.role, COALESCE(recipient.user_id, ${NO_USER_ID}::uuid)
  `)
  const { rows } = await query<CopyrightTerritorialStaffRecipient>(statement)
  return { results: rows.slice(0, options.limit), hasNextPage: rows.length > options.limit }
}
