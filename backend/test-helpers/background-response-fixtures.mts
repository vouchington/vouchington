import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'

/** Ages one owned UUIDv7 registration without changing the shared database clock. */
export async function ageBackgroundResponseRegistration(
  responseId: string,
  createdAt: Date,
): Promise<void> {
  await write(sql`/* ageBackgroundResponseRegistration */
    UPDATE openai_background_responses
    SET id = uuidv7(${createdAt}::timestamptz - clock_timestamp())
    WHERE response_id = ${responseId}
  `)
}

export async function countBackgroundResponseRegistrations(responseId: string): Promise<number> {
  const { rows } = await write<{ count: string }>(sql`/* countBackgroundResponseRegistrations */
    SELECT COUNT(*)::text AS count FROM openai_background_responses
    WHERE response_id = ${responseId}
  `)
  return Number(rows[0]?.count ?? 0)
}
