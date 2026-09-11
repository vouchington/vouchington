import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'
import type { SupportRagResult } from './types.mts'

export async function searchSupportMessagesForRag(
  query: string,
  options?: { limit?: number },
): Promise<SupportRagResult[]> {
  const limit = Math.min(options?.limit ?? 5, 10)

  const { rows } = await read(sql`/* searchSupportMessagesForRag */
    SELECT
      sm.id,
      sm.support_thread_id AS thread_id,
      st.subject AS thread_subject,
      sc.name AS contact_name,
      sc.email_address AS contact_email,
      sm.direction,
      LEFT(sm.body_text, 1000) AS body_text,
      sm.created_at
    FROM support_messages sm
    JOIN support_threads st ON st.id = sm.support_thread_id
    JOIN support_contacts sc ON sc.id = st.support_contact_id
    WHERE sm.search_vector @@ plainto_tsquery('voucha_english', ${query})
    ORDER BY ts_rank(sm.search_vector, plainto_tsquery('voucha_english', ${query})) DESC
    LIMIT ${limit}
  `)

  return rows as SupportRagResult[]
}
