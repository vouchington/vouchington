import { write } from '../fixture-executor.mts'
import sql from '../fixture-sql.mts'

export async function setTestUserDirectMessagesAudience(
  userId: string,
  audience: string,
): Promise<void> {
  await write(sql`/* setTestUserDirectMessagesAudience */
    UPDATE users SET direct_messages_audience = ${audience}::user_privacy_audiences
    WHERE id = ${userId}
  `)
}
