import { write, read } from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'

export const upsertUrlHostnames = async (
  userId: string | null,
  hostnames: string[],
  options: QueryOptions = {},
): Promise<Map<string, string>> => {
  const normalizedHostnames = [
    ...new Set(
      hostnames.flat(Infinity).map(x => {
        try {
          // If it's already a full URL, parse it directly
          if (x.startsWith('http://') || x.startsWith('https://')) {
            return new URL(x).hostname
          }
          // Otherwise, prepend https://
          return new URL(`https://${x}`).hostname
        } catch {
          // If URL parsing fails, return as-is (might be invalid, but let the database handle it)
          return x
        }
      }),
    ),
  ]

  if (normalizedHostnames.length === 0) {
    return new Map()
  }

  // Read-then-write pattern: check which hostnames already exist (from replica)
  const existingResult = await read(
    `/* upsertUrlHostnames */
    SELECT id, hostname FROM url_hostnames
    WHERE hostname = ANY($1::text[])
  `,
    [normalizedHostnames],
    options,
  )

  const existingMap = new Map<string, string>(
    existingResult.rows.map(row => [row.hostname, row.id]),
  )

  // Filter: only insert missing hostnames
  const missingHostnames = normalizedHostnames.filter(hostname => !existingMap.has(hostname))

  if (missingHostnames.length === 0) {
    return existingMap // All exist, skip write
  }

  // Write: insert only new hostnames (ON CONFLICT as safety net for replica lag/race conditions)
  const { rows: newRows } = await write(
    `/* upsertUrlHostnames */
    WITH input(hostname) AS (
      SELECT unnest($1::text[])
    ),
    parent_policy AS (
      SELECT
        hostname,
        blocked,
        REPLACE(REPLACE(REPLACE(hostname, chr(92), chr(92) || chr(92)), '%', chr(92) || '%'), '_', chr(92) || '_') AS hostname_like
      FROM url_hostnames
      WHERE blocked = TRUE
    ),
    inherited AS (
      SELECT
        input.hostname,
        EXISTS (
          SELECT 1
          FROM parent_policy parent
          WHERE parent.blocked = TRUE
            AND (
              input.hostname = parent.hostname
              OR input.hostname LIKE '%.' || parent.hostname_like ESCAPE '\\'
            )
        ) AS blocked,
        FALSE AS skip_web_risk
      FROM input
    )
    INSERT INTO url_hostnames (hostname, created_by_id, crawlable, blocked, skip_web_risk)
    SELECT
      hostname,
      $2,
      true,
      blocked,
      skip_web_risk
    FROM inherited
    ORDER BY hostname
    ON CONFLICT (hostname) DO UPDATE SET hostname = EXCLUDED.hostname
    RETURNING id, hostname, blocked
  `,
    [missingHostnames, userId || null],
    options,
  )

  // For newly-inserted hostnames that inherited a block from a parent hostname,
  // insert a url_hostname_blocks row so the trigger keeps url_hostnames.blocked in sync.
  const inheritedBlockedIds: string[] = []
  for (const row of newRows as Array<{ id: string; hostname: string; blocked: boolean }>) {
    if (row.blocked) inheritedBlockedIds.push(row.id)
  }

  if (inheritedBlockedIds.length > 0) {
    await write(
      `/* upsertUrlHostnames:inheritedBlocks */
      INSERT INTO url_hostname_blocks (url_hostname_id, blocked_source)
      SELECT t.hn_id, 'parent_hostname'
      FROM unnest($1::uuid[]) AS t(hn_id)
      WHERE NOT EXISTS (
        SELECT 1 FROM url_hostname_blocks
        WHERE url_hostname_id = t.hn_id
          AND lifted_at IS NULL
      )
    `,
      [inheritedBlockedIds],
      options,
    )
  }

  // Merge existing and new
  newRows.forEach(row => existingMap.set(row.hostname, row.id))
  return existingMap
}
