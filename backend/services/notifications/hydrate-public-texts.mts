import { read } from '@data-stores/psql'
import { decryptSecret } from '@modules/token-secrets'
import sql from 'sql-template-strings'
import type { Notification } from './types.mts'

type TextSource = Pick<
  Notification,
  | 'kind'
  | 'review_dispute_id'
  | 'moderation_appeal_id'
  | 'user_warning_id'
  | 'community_application_id'
  | 'copyright_notice_delivery_work_item_id'
>

function ids(rows: TextSource[], pick: (row: TextSource) => string | null): string[] {
  return [...new Set(rows.flatMap(row => pick(row) ?? []))]
}

/**
 * Moderator-authored text the recipient may read, keyed by its owning row id. A response is
 * exposed only once it was sent to the recipient; unsent drafts never reach a notification.
 */
export async function hydratePublicTexts(
  userId: string,
  notifications: TextSource[],
): Promise<Record<string, string>> {
  const disputeIds = ids(notifications, n =>
    n.kind === 'review_dispute_resolved' ? n.review_dispute_id : null,
  )
  const appealIds = ids(notifications, n => n.moderation_appeal_id)
  const warningIds = ids(notifications, n => n.user_warning_id)
  const applicationIds = ids(notifications, n =>
    n.kind === 'community_application_rejected' ? n.community_application_id : null,
  )
  const deliveryIds = ids(notifications, n => n.copyright_notice_delivery_work_item_id)
  if (
    disputeIds.length +
      appealIds.length +
      warningIds.length +
      applicationIds.length +
      deliveryIds.length ===
    0
  ) {
    return {}
  }

  const { rows } = await read<{ id: string; text: string }>(sql`/* hydrateNotificationPublicTexts */
    SELECT id, public_response AS text FROM review_disputes
    WHERE id = ANY(${disputeIds}::uuid[]) AND disputant_user_id = ${userId}
      AND sent_at IS NOT NULL AND public_response IS NOT NULL
    UNION ALL
    SELECT id, public_response FROM moderation_appeals
    WHERE id = ANY(${appealIds}::uuid[]) AND appellant_user_id = ${userId}
      AND sent_at IS NOT NULL AND public_response IS NOT NULL
    UNION ALL
    SELECT id, public_message FROM user_warnings
    WHERE id = ANY(${warningIds}::uuid[]) AND user_id = ${userId} AND public_message IS NOT NULL
    UNION ALL
    SELECT id, rejection_reason FROM community_applications
    WHERE id = ANY(${applicationIds}::uuid[]) AND user_id = ${userId}
      AND rejected_at IS NOT NULL AND rejection_reason IS NOT NULL
  `)
  const texts = Object.fromEntries(rows.map(row => [row.id, row.text]))

  if (deliveryIds.length > 0) {
    const { rows: copyrightRows } = await read<{
      id: string
      message_id: string
      body_ciphertext: string
    }>(sql`/* hydrateNotificationCopyrightSummaries */
      SELECT work_item.id, message.id AS message_id, message.body_ciphertext
      FROM copyright_notice_delivery_work_items work_item
      JOIN copyright_notice_correspondence_messages message
        ON message.id = work_item.copyright_notice_correspondence_message_id
      WHERE work_item.id = ANY(${deliveryIds}::uuid[])
    `)
    for (const row of copyrightRows) {
      // The first paragraph is the builder's stored summary; the rest is the email-only letter.
      texts[row.id] = decryptSecret(
        row.body_ciphertext,
        `copyright-correspondence:${row.message_id}`,
      ).split('\n\n')[0]!
    }
  }
  return texts
}
