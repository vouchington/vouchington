import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'

/** Replaces the free text of an existing notification, to give a fixture another user's words. */
export async function setTestNotificationText(
  notificationId: string,
  text: { title: string; body: string; actorLabel: string | null },
): Promise<void> {
  await write(sql`/* setTestNotificationText */
    UPDATE notifications
    SET title = ${text.title}, body = ${text.body}, actor_label = ${text.actorLabel}
    WHERE id = ${notificationId}::uuid
  `)
}
