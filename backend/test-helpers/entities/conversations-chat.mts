import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { createTestConversation } from './conversations.mts'

export async function createTestChatConversationWithParticipant(
  createdById: string,
  participantUserId: string,
) {
  const conversation = await createTestConversation({ createdById })
  await write(sql`/* createTestChatConversationWithParticipant */
    INSERT INTO conversation_participants (conversation_id, user_id, role)
    VALUES (${conversation.id}, ${participantUserId}, 'member')
  `)
  return conversation
}
