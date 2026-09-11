import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { validateUUID } from '@modules/utils'
import { decodeUuidCursor, buildPageInfo, isSimpleCursor } from '@modules/pagination'
import type { PageInfo } from '@voucha/types/pagination'
import type { CrmMessage } from './types.mts'

const MESSAGE_COLUMNS = sql`
  id,
  conversation_id,
  direction,
  email_from AS from_email,
  email_to AS to_email,
  email_subject AS subject,
  body_text,
  body_html,
  email_provider,
  email_message_id AS ses_message_id,
  sent_at,
  delivered_at,
  bounced_at,
  received_at,
  discarded_at,
  ai_prompt,
  ai_generated_at,
  created_by_id AS sent_by_id,
  created_at,
  updated_at,
  'crm_message' AS __entity_type
`

export type GetCrmMessagesByConversationIdOptions = {
  limit?: number
  after?: string
}

export type GetCrmMessagesByConversationIdResult = {
  results: CrmMessage[]
  page_info: PageInfo
}

export async function getCrmMessagesByConversationId(
  conversationId: string,
  options?: GetCrmMessagesByConversationIdOptions,
): Promise<GetCrmMessagesByConversationIdResult> {
  validateUUID(conversationId)
  const limit = Math.min(Math.max(options?.limit ?? 25, 1), 100)

  let afterId: string | null = null
  if (options?.after) {
    const cursor = decodeUuidCursor(options.after, isSimpleCursor, 'Invalid cursor format')
    afterId = cursor.id
  }

  const query = sql`/* getCrmMessagesByConversationId */
    SELECT `
  query.append(MESSAGE_COLUMNS)
  query.append(sql`
    FROM conversation_messages
    WHERE conversation_id = ${conversationId}
      AND kind = 'email'
  `)

  if (afterId) {
    query.append(sql` AND id < ${afterId}`)
  }

  query.append(sql` ORDER BY id DESC LIMIT ${limit + 1}`)

  const { rows } = await read(query)
  const messages = rows as CrmMessage[]

  const hasNextPage = messages.length > limit
  const results = hasNextPage ? messages.slice(0, limit) : messages

  const page_info = buildPageInfo(results, {
    hasNextPage,
    getCursor: item => ({ id: item.id }),
  })

  return { results, page_info }
}

export async function getCrmMessagesByContactId(
  contactId: string,
  options?: GetCrmMessagesByConversationIdOptions,
): Promise<GetCrmMessagesByConversationIdResult> {
  validateUUID(contactId)

  const conversationId = await getCrmConversationIdByContactId(contactId)
  if (!conversationId) return emptyCrmMessagesPage()

  return getCrmMessagesByConversationId(conversationId, options)
}

async function getCrmConversationIdByContactId(contactId: string): Promise<string | null> {
  const { rows } = await read(sql`/* getCrmConversationIdByContactId */
    SELECT conversation_id
    FROM conversation_participants
    WHERE crm_contact_id = ${contactId}
      AND removed_at IS NULL
    LIMIT 1
  `)
  return (rows[0] as { conversation_id: string } | undefined)?.conversation_id ?? null
}

function emptyCrmMessagesPage(): GetCrmMessagesByConversationIdResult {
  return {
    results: [],
    page_info: { has_next_page: false, start_cursor: null, end_cursor: null },
  }
}
