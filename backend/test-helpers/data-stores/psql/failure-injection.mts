import { write } from '@data-stores/psql'

/** Names of the non-internal triggers declared directly on the given `public` tables. */
export async function readTableTriggerNames(tables: readonly string[]): Promise<string[]> {
  const { rows } = await write<{ trigger_name: string }>(
    `/* readTableTriggerNames */
      SELECT DISTINCT tgname AS trigger_name
      FROM pg_trigger
      WHERE NOT tgisinternal
        AND tgrelid = ANY (SELECT to_regclass('public.' || table_name) FROM unnest($1::text[]) AS table_name)
      ORDER BY trigger_name`,
    [tables],
  )
  return rows.map(row => row.trigger_name)
}
