import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'

type InsertTestSupportContactOptions = {
  emailAddress: string
  name?: string
  userId?: string | null
  notes?: string
}

export async function insertTestSupportContact(options: InsertTestSupportContactOptions) {
  const { rows } = await write(sql`
    INSERT INTO support_contacts (email_address, name, user_id, notes)
    VALUES (
      ${options.emailAddress.toLowerCase().trim()},
      ${options.name ?? ''},
      ${options.userId ?? null},
      ${options.notes ?? ''}
    )
    ON CONFLICT (email_address) DO UPDATE
      SET updated_at = CURRENT_TIMESTAMP
    RETURNING id
  `)
  return { id: rows[0].id as string }
}
