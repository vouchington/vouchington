import { beginTransaction } from '@data-stores/psql'
import sql from 'sql-template-strings'

/** Removes only this notification's captured intent to exercise durable-intent recovery. */
export async function createTestNotificationWithoutPushIntent(userId: string): Promise<string> {
  {
    await using transaction = await beginTransaction()
    const query = transaction
    const { rows } = await query(sql`/* createTestNotificationWithoutPushIntent */
        INSERT INTO notifications (
          user_id, entity_type, delivery_type, title, body, target_path
        ) VALUES (
          ${userId}, 'referral_click', 'subscription', 'Recovery notification',
          'Missing durable push intent', '/my/referrals'
        )
        RETURNING id
    `)
    const result = (rows[0] as { id: string }).id
    await query(sql`/* removeOwnedNotificationPushIntent */
      DELETE FROM notification_push_intents
      WHERE user_id = ${userId}::uuid AND notification_id = ${result}::uuid
    `)
    await transaction.commit()
    return result
  }
}
