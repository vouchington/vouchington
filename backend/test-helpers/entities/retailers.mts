import { read, write } from '../fixture-executor.mts'
import sql from '../fixture-sql.mts'

export async function getTestCountryId(code: string): Promise<number> {
  const { rows } = await read(sql`/* getTestCountryId */
    SELECT id FROM countries WHERE code = ${code} LIMIT 1
  `)
  if (!rows[0]) throw new Error(`Country with code ${code} not found`)
  return rows[0].id
}

export async function insertTestRetailer(data: { topicId: string }): Promise<void> {
  await write(sql`/* insertTestRetailer */
    INSERT INTO retailer_topics (topic_id)
    VALUES (${data.topicId})
    ON CONFLICT (topic_id) DO NOTHING
  `)
}
