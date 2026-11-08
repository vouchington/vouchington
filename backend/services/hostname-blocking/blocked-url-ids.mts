import assert from 'node:assert/strict'
import { write } from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'
import { relationLimitsMaxValues } from '@services/entity-relations/relation-limits-config'
import sql from 'sql-template-strings'

/** URL ids whose hostname, or a parent suffix, is blocked. One statement for the whole set. */
export async function blockedUrlIdsForHostnameBlocks(
  urlIds: readonly string[],
  options: QueryOptions = {},
): Promise<Set<string>> {
  if (urlIds.length === 0) return new Set()
  assert.ok(
    urlIds.length <= relationLimitsMaxValues.post_related_url,
    `blockedUrlIdsForHostnameBlocks received ${urlIds.length} URL ids; relationLimitsMaxValues.post_related_url is ${relationLimitsMaxValues.post_related_url}`,
  )
  const { rows } = await write<{ url_id: string }>(
    sql`/* blockedUrlIdsForHostnameBlocks */
      -- no-mistakes-disable-next-line postgres-bounded-statements: blockedUrlIdsForHostnameBlocks asserts urlIds.length is at most relationLimitsMaxValues.post_related_url; a LIMIT on this result would hide a blocked URL and admit it
      SELECT requested.id AS url_id
      FROM (SELECT DISTINCT id FROM unnest(${[...urlIds]}::uuid[]) AS input(id)) AS requested
      CROSS JOIN LATERAL (
        SELECT hostname_id FROM urls WHERE id = requested.id LIMIT 1
      ) url
      CROSS JOIN LATERAL (
        SELECT hostname FROM url_hostnames WHERE id = url.hostname_id LIMIT 1
      ) child
      WHERE EXISTS (
        SELECT 1
        FROM generate_series(
          1,
          cardinality(string_to_array(child.hostname, '.'))
        ) AS suffix(start_label)
        CROSS JOIN LATERAL (
          SELECT 1
          FROM url_hostnames AS blocked
          WHERE blocked.hostname = array_to_string(
              (string_to_array(child.hostname, '.'))[suffix.start_label:],
              '.'
            )
            AND blocked.is_blocked
          LIMIT 1
        ) hit
      )`,
    options,
  )
  const blocked = new Set<string>()
  for (const row of rows) blocked.add(row.url_id)
  return blocked
}
