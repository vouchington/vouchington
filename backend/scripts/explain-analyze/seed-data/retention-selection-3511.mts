import { write } from '@data-stores/psql'

/** A small due tail among terminal push intents exercises the retention cursor. */
export async function seedRetentionSelection3511(): Promise<void> {
  console.log('Seeding 2000 terminal push intents with 20 overdue...')
  await write(`/* seedRetentionSelection3511 */
    WITH numbered AS (
      SELECT user_id, id, row_number() OVER (ORDER BY id) AS ordinal
      FROM notifications ORDER BY id LIMIT 2000
    )
    INSERT INTO notification_push_intents (user_id, notification_id, delivered_at)
    SELECT user_id, id,
      CASE WHEN ordinal % 100 = 0 THEN NOW() - INTERVAL '100 days'
        ELSE NOW() - INTERVAL '1 day' END
    FROM numbered
    ON CONFLICT (user_id, notification_id) DO UPDATE
      SET delivered_at = EXCLUDED.delivered_at
      WHERE notification_push_intents.status = 'pending'`)
}
