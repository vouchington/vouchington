import sql from 'sql-template-strings'
import { write } from '@data-stores/psql'
import {
  createTestConversation,
  createTestConversationMessage,
} from '../../entities/conversations.mts'
import { createTestUser } from '../../entities/users.mts'
import type { ContentProvenanceColumns } from './content-provenance.mts'

// A fixture chat message recorded as `system`, so the partitioned conversation_messages table's
// cloned trigger, CHECK and FK are exercised on a real partition row.
export async function createContentProvenanceConversationMessageFixture() {
  const author = await createTestUser()
  const conversation = await createTestConversation({ createdById: author.id })
  const message = await createTestConversationMessage({
    conversationId: conversation.id,
    createdById: author.id,
    content: { role: 'user', content: 'Provenance message' },
  })
  return {
    messageId: message.id,
    updateProvenance: (provenance: ContentProvenanceColumns) =>
      write(sql`/* updateContentProvenanceConversationMessage */
        UPDATE conversation_messages
        SET created_via = ${provenance.createdVia}, created_via_oauth_client_id = ${provenance.oauthClientId}
        WHERE conversation_id = ${conversation.id} AND id = ${message.id}`),
  }
}
