import {
  beginTransaction,
  write,
  read,
  registerPostCommitAction,
  withTransactionOptions,
} from '@data-stores/psql'
import type { QueryOptions, TransactionQuery } from '@data-stores/psql/types'
import { enqueueHostnameCacheInvalidation } from '@services/entity-cache/hostname-invalidation-work'
import { drainHostnameCacheInvalidationWork } from '@services/entity-cache/hostname-invalidation-drain'

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
export async function upsertUrlHostnames(
  userId: string | null,
  hostnames: string[],
  options: QueryOptions = {},
  provenance: HostnameProvenance = 'public',
): Promise<Map<string, string>> {
  if (options.query) return upsertUrlHostnamesWithQuery(userId, hostnames, options, provenance)
  if (options.client)
    return withTransactionOptions(options, query =>
      upsertUrlHostnamesWithQuery(userId, hostnames, { query }, provenance),
    )
  await using transaction = await beginTransaction()
  const result = await upsertUrlHostnamesWithQuery(
    userId,
    hostnames,
    { query: transaction },
    provenance,
  )
  await transaction.commit()
  return result
}
/** The following staff block owns public introduction and invalidation after ordered row locks. */
export async function upsertUrlHostnamesForBlocking(
  userId: string,
  hostnames: string[],
  query: TransactionQuery,
): Promise<Map<string, string>> {
  return upsertUrlHostnamesWithQuery(userId, hostnames, { query }, 'private_email', false)
}
async function upsertUrlHostnamesWithQuery(
  userId: string | null,
  hostnames: string[],
  options: QueryOptions,
  provenance: HostnameProvenance,
  enqueueOwnInvalidation = true,
): Promise<Map<string, string>> {
  const normalizedHostnames = [...new Set(hostnames.flat(Infinity).map(normalizeUrlHostname))]

  if (normalizedHostnames.length === 0) {
    return new Map()
  }

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
    if (enqueueOwnInvalidation) await enqueueChangedHostnames(promotedRows, options)
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

  // Only new rows can inherit parent blocks; record those blocks for trigger consistency.
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

  newRows.forEach(row => existingMap.set(row.hostname, row.id))
  if (enqueueOwnInvalidation) await enqueueChangedHostnames([...promotedRows, ...newRows], options)
  return existingMap
}

async function enqueueChangedHostnames(
  changed: Array<{ id: string; hostname: string }>,
  options: QueryOptions,
): Promise<void> {
  if (changed.length === 0) return
  await withTransactionOptions(options, async query => {
    const hostnameIds = [...new Set(changed.map(row => row.id))]
    await enqueueHostnameCacheInvalidation(query, hostnameIds)
    registerPostCommitAction(query, async () => {
      await drainHostnameCacheInvalidationWork({ hostnameIds })
    })
  })
}
