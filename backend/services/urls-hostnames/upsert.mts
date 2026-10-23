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
import {
  getNewPublicHostnamesInheritedBlockedIds,
  insertMissingUrlHostnames,
} from './insert-missing.mts'
import { lockHostnameOwnership } from './ownership-lock.mts'

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
/** Resolve private IDs; the caller owns the later public introduction or block and its invalidation. */
export async function prepareUrlHostnamesForOwnedMutation(
  userId: string | null,
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

  if (normalizedHostnames.length === 0) return new Map()

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

  if (missingHostnames.length === 0) {
    const promotedRows =
      provenance === 'public'
        ? await promotePublicUrlHostnames([...existingMap.values()], options)
        : []
    if (enqueueOwnInvalidation) await enqueueChangedHostnames(promotedRows, options)
    return existingMap
  }

  const newRows = await insertMissingUrlHostnames(
    missingHostnames,
    userId,
    provenance === 'public',
    options,
  )

  // A conflicting INSERT can wait for a transaction invisible to the first SELECT.
  // Resolve its committed row with a fresh statement snapshot, without a row lock.
  const insertedNames = new Set(newRows.map(row => row.hostname))
  const conflictedNames = missingHostnames.filter(hostname => !insertedNames.has(hostname))
  if (conflictedNames.length > 0) {
    const { rows: conflictedRows } = await read<{ id: string; hostname: string }>(
      `/* upsertUrlHostnames:resolveConflicts */
      SELECT id, hostname FROM url_hostnames WHERE hostname = ANY($1::text[])`,
      [conflictedNames],
      options,
    )
    for (const row of conflictedRows) existingMap.set(row.hostname, row.id)
  }
  newRows.forEach(row => existingMap.set(row.hostname, row.id))
  const promotedRows =
    provenance === 'public'
      ? await promotePublicUrlHostnames([...existingMap.values()], options)
      : []

  const inheritedBlockedIds =
    provenance === 'public'
      ? await getNewPublicHostnamesInheritedBlockedIds(
          newRows.map(row => row.id),
          options,
        )
      : newRows.flatMap(row => (row.is_blocked ? [row.id] : []))

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

  if (enqueueOwnInvalidation) await enqueueChangedHostnames([...promotedRows, ...newRows], options)
  return existingMap
}

async function promotePublicUrlHostnames(
  hostnameIds: string[],
  options: QueryOptions,
): Promise<Array<{ id: string; hostname: string }>> {
  if (hostnameIds.length === 0) return []
  await withTransactionOptions(options, query => lockHostnameOwnership(query, hostnameIds))
  const result = await write<{ id: string; hostname: string }>(
    `/* upsertUrlHostnames:promotePublic */
    UPDATE url_hostnames
    SET publicly_introduced_at = COALESCE(publicly_introduced_at, CURRENT_TIMESTAMP)
    WHERE id = ANY($1::uuid[]) AND publicly_introduced_at IS NULL
    RETURNING id, hostname`,
    [hostnameIds],
    options,
  )
  return result.rows
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
