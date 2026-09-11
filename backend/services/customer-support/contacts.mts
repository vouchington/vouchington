import { read, write, type QueryOptions } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { decodeUuidCursor, isSimpleCursor, buildPageInfo } from '@modules/pagination'
import type { PageInfo } from '@voucha/types/pagination'
import type { SupportContact } from './types.mts'

export async function getOrCreateSupportContactByEmail(
  emailAddress: string,
  name?: string,
  options: QueryOptions = {},
): Promise<SupportContact> {
  const normalizedEmail = emailAddress.toLowerCase().trim()
  const query = sql`/* getOrCreateSupportContactByEmail */
    INSERT INTO support_contacts (email_address, name)
    VALUES (${normalizedEmail}, ${name ?? ''})
    ON CONFLICT (email_address) DO UPDATE
      SET
        name = CASE
          WHEN ${name != null} AND EXCLUDED.name != '' THEN EXCLUDED.name
          ELSE support_contacts.name
        END,
        updated_at = CURRENT_TIMESTAMP
    RETURNING
      id,
      email_address,
      name,
      user_id,
      notes,
      created_at,
      updated_at
  `
  const { rows } = await write(query, options)
  return rows[0] as SupportContact
}

export async function getSupportContactById(id: string): Promise<SupportContact | null> {
  const { rows } = await read(sql`/* getSupportContactById */
    SELECT
      id,
      email_address,
      name,
      user_id,
      notes,
      created_at,
      updated_at
    FROM support_contacts
    WHERE id = ${id}
    LIMIT 1
  `)
  return (rows[0] as SupportContact) ?? null
}

export async function getSupportContactByEmail(
  emailAddress: string,
): Promise<SupportContact | null> {
  const normalizedEmail = emailAddress.toLowerCase().trim()
  const { rows } = await read(sql`/* getSupportContactByEmail */
    SELECT
      id,
      email_address,
      name,
      user_id,
      notes,
      created_at,
      updated_at
    FROM support_contacts
    WHERE email_address = ${normalizedEmail}
    LIMIT 1
  `)
  return (rows[0] as SupportContact) ?? null
}

export async function updateSupportContact(
  id: string,
  params: { name?: string; notes?: string; userId?: string | null },
): Promise<SupportContact | null> {
  const query = sql`/* updateSupportContact */
    UPDATE support_contacts
    SET updated_at = CURRENT_TIMESTAMP
  `
  if (params.name !== undefined) {
    query.append(sql`, name = ${params.name}`)
  }
  if (params.notes !== undefined) {
    query.append(sql`, notes = ${params.notes}`)
  }
  if (params.userId !== undefined) {
    query.append(sql`, user_id = ${params.userId}`)
  }
  query.append(sql`
    WHERE id = ${id}
    RETURNING
      id,
      email_address,
      name,
      user_id,
      notes,
      created_at,
      updated_at
  `)
  const { rows } = await write(query)
  return (rows[0] as SupportContact) ?? null
}

export async function linkSupportContactToUser(contactId: string, userId: string): Promise<void> {
  await write(sql`/* linkSupportContactToUser */
    UPDATE support_contacts
    SET user_id = ${userId},
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ${contactId}
  `)
}

export async function searchSupportContacts(options?: {
  q?: string
  limit?: number
  after?: string
}): Promise<{ results: SupportContact[]; page_info: PageInfo }> {
  const limit = Math.min(Math.max(options?.limit ?? 25, 1), 100)

  let afterId: string | null = null
  if (options?.after) {
    const cursor = decodeUuidCursor(options.after, isSimpleCursor, 'Invalid cursor format')
    afterId = cursor.id
  }

  const query = sql`/* searchSupportContacts */
    SELECT
      id,
      email_address,
      name,
      user_id,
      notes,
      created_at,
      updated_at
    FROM support_contacts
    WHERE 1=1
  `

  if (options?.q) {
    query.append(
      sql` AND (email_address ILIKE '%' || ${options.q} || '%' OR name ILIKE '%' || ${options.q} || '%')`,
    )
  }

  if (afterId) {
    query.append(sql` AND id < ${afterId}`)
  }

  query.append(sql` ORDER BY id DESC LIMIT ${limit + 1}`)

  const { rows } = await read(query)
  const contacts = rows as SupportContact[]

  const hasNextPage = contacts.length > limit
  const results = hasNextPage ? contacts.slice(0, limit) : contacts

  const page_info = buildPageInfo(results, {
    hasNextPage,
    getCursor: item => ({ id: item.id }),
  })

  return { results, page_info }
}
