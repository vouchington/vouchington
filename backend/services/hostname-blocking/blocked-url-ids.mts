import { write } from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'
import sql from 'sql-template-strings'

/** URL ids whose hostname, or a parent suffix, is blocked. One statement for the whole set. */
export async function blockedUrlIdsForHostnameBlocks(
  urlIds: readonly string[],
  options: QueryOptions = {},
): Promise<Set<string>> {
  if (urlIds.length === 0) return new Set()
  const { rows } = await write<{ url_id: string }>(
    sql`/* blockedUrlIdsForHostnameBlocks */
      -- no-mistakes-disable-next-line postgres-bounded-statements: the caller passes one projection prefix, at most the post_related_url hard maximum of 10000; a LIMIT would hide a blocked URL and admit it
      SELECT requested.id AS url_id
      FROM unnest(${[...urlIds]}::uuid[]) AS requested(id)
      JOIN urls ON urls.id = requested.id
      JOIN url_hostnames AS child ON child.id = urls.hostname_id
      WHERE EXISTS (
        SELECT 1
        FROM generate_series(1, cardinality(string_to_array(child.hostname, '.'))) AS suffix(start_label)
        JOIN url_hostnames AS blocked
          ON blocked.hostname = array_to_string(
            (string_to_array(child.hostname, '.'))[suffix.start_label:],
            '.'
          )
         AND blocked.is_blocked
      )`,
    options,
  )
  const blocked = new Set<string>()
  for (const row of rows) blocked.add(row.url_id)
  return blocked
}
