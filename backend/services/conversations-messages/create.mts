import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import type { ContentProvenance } from '@voucha/types/entities/content-provenance'
import {
  appendConversationMessageReturning,
  parseConversationMessageContent,
} from './chat-content.mts'
import type { Conversation, ConversationMessage } from './types.mts'

export async function createConversation(createdById: string, title = ''): Promise<Conversation> {
  const { rows } = await write<Conversation>(sql`/* createConversation */
      INSERT INTO conversations (created_by_id, title)
      VALUES (${createdById}, ${title})
      RETURNING *
    `)
  return rows[0]!
}

/**
 * @public Retained provisionally under issue #1360 and documented in
 * `docs/overview/architecture/services/conversations-messages/README.md`; production use is
 * unconfirmed and this export may be removed after intended-use review.
 */
export async function createConversationMessage(
  conversationId: string,
  createdById: string,
  provenance: ContentProvenance,
  content: unknown,
): Promise<ConversationMessage> {
  const envelope = parseConversationMessageContent(content)
  const query = sql`/* createConversationMessage */
    INSERT INTO conversation_messages (
      conversation_id, created_by_id, created_via, created_via_oauth_client_id, content
    )
    VALUES (
      ${conversationId}, ${createdById}, ${provenance.createdVia}, ${provenance.oauthClientId},
      ${JSON.stringify(envelope)}
    )
    RETURNING
  `
  appendConversationMessageReturning(query)
  const { rows } = await write<ConversationMessage>(query)
  return rows[0]!
}
