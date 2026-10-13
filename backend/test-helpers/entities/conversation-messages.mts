import { allowUnannotatedQuery } from '@data-stores/psql/prepared-statement-name'
import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'

type CreateTestDirectMessageOptions = {
  conversationId: string
  createdById: string
  bodyText: string
}

export async function createTestDirectMessage(options: CreateTestDirectMessageOptions) {
  const { rows } = await write(sql`/* createTestDirectMessage */
    INSERT INTO conversation_messages (conversation_id, kind, body_text, created_by_id, created_via)
    VALUES (${options.conversationId}, 'message', ${options.bodyText}, ${options.createdById}, 'system')
    RETURNING id
  `)
  return { id: rows[0].id as string }
}

type CreateTestConversationMessageOptions = {
  conversationId: string
  createdById: string
  content: unknown
}

export async function createTestConversationMessage(options: CreateTestConversationMessageOptions) {
  const { rows } = await write(
    allowUnannotatedQuery(sql`
    INSERT INTO conversation_messages (conversation_id, created_by_id, created_via, content)
    VALUES (
      ${options.conversationId}, ${options.createdById}, 'system', ${JSON.stringify(options.content)}
    )
    RETURNING id
  `),
  )
  return { id: rows[0].id as string }
}
