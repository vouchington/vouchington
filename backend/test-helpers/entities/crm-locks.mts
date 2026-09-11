import { write, type QueryOptions } from '@data-stores/psql'
import sql from 'sql-template-strings'

export async function lockTestCrmContact(
  contactId: string,
  query: NonNullable<QueryOptions['query']>,
): Promise<void> {
  await write(
    sql`/* lockTestCrmContact */
      SELECT id
      FROM crm_contacts
      WHERE id = ${contactId}
      FOR UPDATE
    `,
    { query },
  )
}
