import { beginTransaction } from '@data-stores/psql'
import sql from 'sql-template-strings'

/** Creates a notification without the durable capture trigger for replay tests. */
export async function createTestPreCaptureNotification(userId: string): Promise<string> {
  {
    await using transaction = await beginTransaction()
    const query = transaction
    await query(sql`SET LOCAL session_replication_role = replica`)
    const { rows } = await query(sql`/* createTestPreCaptureNotification */
        INSERT INTO notifications (
          user_id, entity_type, delivery_type, title, body, target_path
        ) VALUES (
          ${userId}, 'referral_click', 'subscription', 'Pre-capture notification',
          'Queued before durable push capture', '/my/referrals'
        )
        RETURNING id
    `)
    const result = (rows[0] as { id: string }).id
    await transaction.commit()
    return result
  }
}
