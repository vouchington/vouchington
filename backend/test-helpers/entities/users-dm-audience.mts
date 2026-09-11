import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'

export async function setTestUserDirectMessagesAudience(
  userId: string,
  audience: string,
): Promise<void> {
  await write(sql`/* setTestUserDirectMessagesAudience */
    UPDATE users SET direct_messages_audience = ${audience}::user_privacy_audiences
    WHERE id = ${userId}
  `)
}
