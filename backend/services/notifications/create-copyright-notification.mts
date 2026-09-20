import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'

/** Creates the member-visible, non-sensitive projection of one legal delivery intent. */
export async function createCopyrightNoticeNotification(input: {
  userId: string
  noticeId: string
  eventKey: string
  deliveryKind: 'claimant_receipt' | 'status_update' | 'poster_restriction_notice'
}): Promise<void> {
  const copy = copyrightNotificationCopy(input.deliveryKind)
  await write(sql`/* createCopyrightNoticeNotification */
    INSERT INTO notifications (
      user_id, entity_type, copyright_notice_id, event_key, delivery_type, title, body, target_path
    ) VALUES (
      ${input.userId}, 'copyright_notice', ${input.noticeId}, ${input.eventKey}, 'subscription',
      ${copy.title}, ${copy.body}, ${`/copyright-notices/${input.noticeId}`}
    ) ON CONFLICT (user_id, event_key) WHERE event_key IS NOT NULL DO NOTHING
  `)
}

function copyrightNotificationCopy(
  deliveryKind: 'claimant_receipt' | 'status_update' | 'poster_restriction_notice',
): { title: string; body: string } {
  switch (deliveryKind) {
    case 'claimant_receipt':
      return { title: 'Copyright notice received', body: 'Your copyright notice was received.' }
    case 'poster_restriction_notice':
      return {
        title: 'Material restricted for a copyright notice',
        body: 'Review the case and available response options.',
      }
    case 'status_update':
      return { title: 'Copyright case update', body: 'There is an update to your copyright case.' }
  }
}
