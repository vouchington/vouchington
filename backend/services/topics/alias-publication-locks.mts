import type { TransactionQuery } from '@data-stores/psql/types'

/** Reads existing alias ids by their stable alias strings. */
export async function lockExistingTopicAliasPublicationScopes(
  query: TransactionQuery,
  aliases: readonly string[],
): Promise<ReadonlyMap<string, string>> {
  if (aliases.length === 0) return new Map()
  const { rows } = await query<{ id: string; alias: string }>(
    `/* lockExistingTopicAliasPublicationScopes */
    SELECT id, alias
    FROM topic_aliases
    WHERE alias = ANY($1::text[])
    ORDER BY id`,
    [aliases],
  )
  return new Map(rows.map(row => [row.alias, row.id]))
}
