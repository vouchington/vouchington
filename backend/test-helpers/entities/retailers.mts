import { read, write } from '@data-stores/psql'
import sql from 'sql-template-strings'

export async function getTestCountryId(code: string): Promise<number> {
  const { rows } = await read(sql`/* getTestCountryId */
    SELECT id FROM countries WHERE code = ${code} LIMIT 1
  `)
  if (!rows[0]) throw new Error(`Country with code ${code} not found`)
  return rows[0].id
}

export async function insertTestRetailer(data: { topicId: string }): Promise<void> {
  await write(sql`/* insertTestRetailer */
    INSERT INTO topics__retailers (topic_id)
    VALUES (${data.topicId})
    ON CONFLICT (topic_id) DO NOTHING
  `)
}
