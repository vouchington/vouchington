import { bloomValkeyClient } from '@data-stores/valkey/clients'
import { loadScript, registerScript } from '@data-stores/valkey/scripts'
import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'

export type BlocklistBloomFilterName = 'url-blocklist' | 'email-blocklist'

const bumpBlocklistBloomGenerationScript = registerScript(
  loadScript('bump-blocklist-bloom-generation.lua', import.meta.url),
)

const absentGeneration = '0'
const generationPattern = /^(\d+):(\d+)$/

export function blocklistBloomGenerationKey(filter: BlocklistBloomFilterName): string {
  return `bloom-filter:${filter}:generation`
}

/** Counts consecutive rebuilds that found the stored transaction not yet visible on the replica. */
export function blocklistBloomVisibilityRetriesKey(filter: BlocklistBloomFilterName): string {
  return `bloom-filter:${filter}:visibility-retries`
}

async function runBump(
  filter: BlocklistBloomFilterName,
  version: string,
  staleGeneration: string,
): Promise<string> {
  const value = await bloomValkeyClient.invokeScript(bumpBlocklistBloomGenerationScript, {
    keys: [blocklistBloomGenerationKey(filter)],
    args: [version, staleGeneration],
  })
  return generationText(value)
}

export async function bumpBlocklistBloomGeneration(
  filter: BlocklistBloomFilterName,
  visibleThrough?: string,
): Promise<string> {
  return runBump(filter, visibleThrough ?? (await readPrimaryTransactionId()), '')
}

/** Replace a generation whose transaction id the primary has never issued, if it is still stored. */
export async function replaceStaleBlocklistBloomGeneration(
  filter: BlocklistBloomFilterName,
  staleGeneration: string,
): Promise<string> {
  return runBump(filter, await readPrimaryTransactionId(), staleGeneration)
}

/** Unlink the ready marker after the bump, including when the bump throws. */
export async function invalidateBlocklistReadyMarker(
  filter: BlocklistBloomFilterName,
  readyKey: string,
): Promise<number> {
  let removed = 0
  try {
    await bumpBlocklistBloomGeneration(filter)
  } finally {
    removed = await bloomValkeyClient.unlink([readyKey])
  }
  return removed
}

export async function readBlocklistBloomGeneration(
  filter: BlocklistBloomFilterName,
): Promise<string> {
  const value = await bloomValkeyClient.get(blocklistBloomGenerationKey(filter))
  if (value === null) return absentGeneration
  return generationText(value)
}

export function generationVisibleThrough(generation: string): string | undefined {
  return generationPattern.exec(generation)?.[2]
}

/**
 * True when the primary has not issued the stored transaction id, so no replica can ever see it.
 * That happens when Valkey outlives a database reset. Ordinary replica lag never matches, because
 * the primary issued every id that a bump recorded. The id this query takes is newer than all of
 * them, and the check only runs after a replica miss, so the extra id is rare.
 */
export async function generationIsBeyondPrimary(generation: string): Promise<boolean> {
  const visibleThrough = generationVisibleThrough(generation)
  if (visibleThrough === undefined) return false
  const { rows } = await write<{ beyond: boolean }>(
    sql`/* rebuildCurrentBlocklistBloomFilter */
      SELECT ${visibleThrough}::xid8 >= pg_current_xact_id() AS beyond`,
  )
  return rows[0]?.beyond ?? false
}

async function readPrimaryTransactionId(): Promise<string> {
  const { rows } = await write<{ id: string }>(
    sql`/* bumpBlocklistBloomGeneration */ SELECT pg_current_xact_id()::text AS id`,
  )
  const id = rows[0]?.id
  if (!id) throw new Error('PostgreSQL did not return a transaction id')
  return id
}

function generationText(value: unknown): string {
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'bigint' || Buffer.isBuffer(value)) {
    return value.toString()
  }
  return absentGeneration
}
