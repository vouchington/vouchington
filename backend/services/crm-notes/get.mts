import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { validateUUID } from '@modules/utils'
import { decodeUuidCursor, buildPageInfo, isSimpleCursor } from '@modules/pagination'
import type { PageInfo } from '@voucha/types/pagination'
import type { CrmNote } from './types.mts'

export type GetCrmNotesByContactIdOptions = {
  limit?: number
  after?: string
}

export type GetCrmNotesByContactIdResult = {
  results: CrmNote[]
  page_info: PageInfo
}

export async function getCrmNotesByContactId(
  contactId: string,
  options?: GetCrmNotesByContactIdOptions,
): Promise<GetCrmNotesByContactIdResult> {
  validateUUID(contactId)
  const limit = Math.min(Math.max(options?.limit ?? 25, 1), 100)

  let afterId: string | null = null
  if (options?.after) {
    const cursor = decodeUuidCursor(options.after, isSimpleCursor, 'Invalid cursor format')
    afterId = cursor.id
  }

  const conversationId = await getCrmConversationIdByContactId(contactId)
  if (!conversationId) return emptyCrmNotesPage()

  const query = sql`/* getCrmNotesByContactId */
    SELECT
      m.id,
      m.conversation_id,
      ${contactId}::UUID AS contact_id,
      m.body_text AS body,
      m.created_by_id,
      m.deleted_at,
      m.created_at,
      m.updated_at,
      'crm_note' AS __entity_type
    FROM conversation_messages m
    WHERE m.kind = 'note'
      AND m.conversation_id = ${conversationId}
      AND m.deleted_at IS NULL
  `

  if (afterId) {
    query.append(sql` AND m.id < ${afterId}`)
  }

  query.append(sql` ORDER BY m.id DESC LIMIT ${limit + 1}`)

  const { rows } = await read(query)
  const notes = rows as CrmNote[]

  const hasNextPage = notes.length > limit
  const results = hasNextPage ? notes.slice(0, limit) : notes

  const page_info = buildPageInfo(results, {
    hasNextPage,
    getCursor: item => ({ id: item.id }),
  })

  return { results, page_info }
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

function emptyCrmNotesPage(): GetCrmNotesByContactIdResult {
  return {
    results: [],
    page_info: { has_next_page: false, start_cursor: null, end_cursor: null },
  }
}
