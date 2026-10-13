import { write, read, registerPostCommitAction, withTransactionOptions } from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'
import { invalidate } from '@services/entity-cache/invalidate'

export type HostnameProvenance = 'public' | 'private_email'

export function normalizeUrlHostname(value: string): string {
  try {
    return new URL(
      value.startsWith('http://') || value.startsWith('https://') ? value : `https://${value}`,
    ).hostname
  } catch {
    return value
  }
}

export const upsertUrlHostnames = async (
  userId: string | null,
  hostnames: string[],
  options: QueryOptions = {},
  provenance: HostnameProvenance = 'public',
): Promise<Map<string, string>> => {
  const normalizedHostnames = [...new Set(hostnames.flat(Infinity).map(normalizeUrlHostname))]

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

  let promotedRows: Array<{ id: string; hostname: string }> = []
  if (provenance === 'public' && existingMap.size > 0) {
    const result = await write<{ id: string; hostname: string }>(
      `/* upsertUrlHostnames:promotePublic */
      UPDATE url_hostnames
      SET publicly_introduced_at = COALESCE(publicly_introduced_at, CURRENT_TIMESTAMP)
      WHERE id = ANY($1::uuid[]) AND publicly_introduced_at IS NULL
      RETURNING id, hostname`,
      [[...existingMap.values()]],
      options,
    )
    promotedRows = result.rows
  }

  if (missingHostnames.length === 0) {
    await invalidateChangedHostnames(promotedRows, options)
    return existingMap // All exist, skip write
  }

  // Write: insert only new hostnames (ON CONFLICT as safety net for replica lag/race conditions)
  const { rows: newRows } = await write<{
    id: string
    hostname: string
    is_blocked: boolean
    inserted: boolean
  }>(
    `/* upsertUrlHostnames */
    WITH input(hostname) AS (
      SELECT unnest($1::text[])
    ),
    parent_policy AS (
      SELECT
        hostname,
        is_blocked,
        REPLACE(REPLACE(REPLACE(hostname, chr(92), chr(92) || chr(92)), '%', chr(92) || '%'), '_', chr(92) || '_') AS hostname_like
      FROM url_hostnames host
      WHERE host.is_blocked
        AND EXISTS (
          SELECT 1 FROM url_hostname_blocks parent_block
          WHERE parent_block.url_hostname_id = host.id
            AND parent_block.lifted_at IS NULL
            AND parent_block.domain_blocklist_source_id IS NULL
        )
    ),
    inherited AS (
      SELECT
        input.hostname,
        EXISTS (
          SELECT 1
          FROM parent_policy parent
          WHERE parent.is_blocked
            AND (
              input.hostname = parent.hostname
              OR input.hostname LIKE '%.' || parent.hostname_like ESCAPE '\\'
            )
        ) AS is_blocked,
        FALSE AS should_skip_web_risk
      FROM input
    )
    INSERT INTO url_hostnames (hostname, created_by_id, is_crawlable, is_blocked, should_skip_web_risk, publicly_introduced_at)
    SELECT
      hostname,
      $2,
      true,
      is_blocked,
      should_skip_web_risk,
      CASE WHEN $3::boolean THEN CURRENT_TIMESTAMP ELSE NULL END
    FROM inherited
    ORDER BY hostname
    ON CONFLICT (hostname) DO UPDATE SET
      hostname = EXCLUDED.hostname,
      publicly_introduced_at = COALESCE(url_hostnames.publicly_introduced_at, EXCLUDED.publicly_introduced_at)
    RETURNING WITH (OLD AS prior) id, hostname, is_blocked, prior.id IS NULL AS inserted
  `,
    [missingHostnames, userId || null, provenance === 'public'],
    options,
  )

  // A conflict can return an already blocked feed-only hostname after a replica miss.
  // Only an actual insert can have inherited a parent block from this statement.
  // For newly-inserted hostnames that inherited a block from a parent hostname,
  // insert a url_hostname_blocks row so the trigger keeps url_hostnames.is_blocked in sync.
  const inheritedBlockedIds: string[] = []
  for (const row of newRows) {
    if (row.inserted && row.is_blocked) inheritedBlockedIds.push(row.id)
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
          AND domain_blocklist_source_id IS NULL
      )
    `,
      [inheritedBlockedIds],
      options,
    )
  }

  // Merge existing and new
  newRows.forEach(row => existingMap.set(row.hostname, row.id))
  await invalidateChangedHostnames([...promotedRows, ...newRows], options)
  return existingMap
}

async function invalidateChangedHostnames(
  changed: Array<{ id: string; hostname: string }>,
  options: QueryOptions,
): Promise<void> {
  if (changed.length === 0) return
  const action = () => invalidate.url_hostnames(...changed)
  if (options.query || options.client) {
    await withTransactionOptions(options, async query => registerPostCommitAction(query, action))
    return
  }
  await action()
}
