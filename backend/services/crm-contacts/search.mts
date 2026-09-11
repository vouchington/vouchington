import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { decodeUuidCursor, buildPageInfo, isNameCursor } from '@modules/pagination'
import type { PageInfo } from '@voucha/types/pagination'
import type { CrmContact, CrmContactStatus, CrmContactVertical } from './types.mts'

export type SearchCrmContactsOptions = {
  status?: CrmContactStatus
  vertical?: CrmContactVertical
  q?: string
  linked?: boolean
  limit?: number
  after?: string
}

export type SearchCrmContactsResult = {
  results: CrmContact[]
  page_info: PageInfo
}

export async function searchCrmContacts(
  options: SearchCrmContactsOptions,
): Promise<SearchCrmContactsResult> {
  const limit = Math.min(Math.max(options.limit ?? 25, 1), 100)

  let afterName: string | null = null
  let afterId: string | null = null
  if (options.after) {
    const cursor = decodeUuidCursor(options.after, isNameCursor, 'Invalid cursor format')
    afterName = cursor.name
    afterId = cursor.id
  }

  const query = sql`/* searchCrmContacts */
    SELECT
      id,
      name,
      email,
      phone,
      vertical,
      contact_type,
      source,
      follower_count,
      notes,
      metadata,
      user_id,
      assigned_to_id,
      created_by_id,
      contacted_at,
      responded_at,
      converted_at,
      opted_out_at,
      archived_at,
      created_at,
      updated_at,
      'crm_contact' AS __entity_type
    FROM crm_contacts
    WHERE TRUE
  `

  if (options.status) {
    const statusExpr = sql`
      CASE
        WHEN opted_out_at IS NOT NULL THEN 'opted_out'
        WHEN archived_at IS NOT NULL THEN 'archived'
        WHEN converted_at IS NOT NULL THEN 'converted'
        WHEN responded_at IS NOT NULL THEN 'in_conversation'
        WHEN contacted_at IS NOT NULL THEN 'awaiting_response'
        ELSE 'new'
      END
    `
    query.append(sql` AND (`)
    query.append(statusExpr)
    query.append(sql`) = ${options.status}`)
  } else {
    // Default: exclude archived and opted_out from the main view unless explicitly filtered
    // (no default exclusion — show all by default)
  }

  if (options.vertical) {
    query.append(sql` AND vertical = ${options.vertical}`)
  }

  if (options.q) {
    const pattern = `%${options.q.trim()}%`
    query.append(sql` AND (name ILIKE ${pattern} OR email ILIKE ${pattern})`)
  }

  if (options.linked === true) {
    query.append(sql` AND user_id IS NOT NULL`)
  } else if (options.linked === false) {
    query.append(sql` AND user_id IS NULL`)
  }

  if (afterName !== null && afterId !== null) {
    query.append(sql` AND (name > ${afterName} OR (name = ${afterName} AND id > ${afterId}))`)
  }

  query.append(sql` ORDER BY name, id LIMIT ${limit + 1}`)

  const { rows } = await read(query)
  const contacts = rows as CrmContact[]

  const hasNextPage = contacts.length > limit
  const results = hasNextPage ? contacts.slice(0, limit) : contacts

  const page_info = buildPageInfo(results, {
    hasNextPage,
    getCursor: item => ({ name: item.name, id: item.id }),
  })

  return { results, page_info }
}
