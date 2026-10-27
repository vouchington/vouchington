import { bloomValkeyClient } from '@data-stores/valkey/clients'
import { loadScript, registerScript } from '@data-stores/valkey/scripts'
import { read, write } from '@data-stores/psql'
import { enqueueRebuildBloomFilter } from '@queues/bloom-filters/enqueues'
import sql from 'sql-template-strings'
import { newBloomReadyMarkerValue } from './ready-marker.mts'

export type BlocklistBloomFilterName = 'url-blocklist' | 'email-blocklist'

export type BlocklistBloomRebuildOptions = {
  afterSnapshot?: () => Promise<void>
}

const bumpBlocklistBloomGenerationScript = registerScript(
  loadScript('bump-blocklist-bloom-generation.lua', import.meta.url),
)
const publishBlocklistReadyMarkerIfGenerationScript = registerScript(
  loadScript('publish-blocklist-ready-marker-if-generation.lua', import.meta.url),
)

const absentGeneration = '0'
const generationPattern = /^(\d+):(\d+)$/

function blocklistBloomGenerationKey(filter: BlocklistBloomFilterName): string {
  return `bloom-filter:${filter}:generation`
}

export async function bumpBlocklistBloomGeneration(
  filter: BlocklistBloomFilterName,
  visibleThrough?: string,
): Promise<string> {
  const version = visibleThrough ?? (await readPrimaryTransactionId())
  const value = await bloomValkeyClient.invokeScript(bumpBlocklistBloomGenerationScript, {
    keys: [blocklistBloomGenerationKey(filter)],
    args: [version],
  })
  return generationText(value)
}

async function readBlocklistBloomGeneration(filter: BlocklistBloomFilterName): Promise<string> {
  const value = await bloomValkeyClient.get(blocklistBloomGenerationKey(filter))
  if (value === null) return absentGeneration
  return generationText(value)
}

/**
 * The stored id is the primary transaction that must be visible before the snapshot.
 * Compare it with the replica's snapshot instead of the sync host's clock.
 */
async function replicaCanSeeBlocklistGeneration(generation: string): Promise<boolean> {
  const visibleThrough = generationVisibleThrough(generation)
  if (visibleThrough === undefined) return true
  const { rows } = await read<{ visible: boolean }>(
    sql`/* rebuildCurrentBlocklistBloomFilter */
      SELECT pg_visible_in_snapshot(${visibleThrough}::xid8, pg_current_snapshot()) AS visible`,
  )
  return rows[0]?.visible ?? false
}

/**
 * Snapshot the blocklist, then publish ready only when no commit landed after that snapshot.
 * `afterSnapshot` runs after the rows are read and before the ready marker is published.
 */
export async function rebuildCurrentBlocklistBloomFilter(input: {
  filter: BlocklistBloomFilterName
  readyKey: string
  stream: () => Promise<void>
  afterSnapshot?: () => Promise<void>
}): Promise<void> {
  const generation = await readBlocklistBloomGeneration(input.filter)
  if (!(await replicaCanSeeBlocklistGeneration(generation))) {
    await enqueueRebuildBloomFilter({ filter: input.filter })
    return
  }

  await streamBlocklistThenAfterSnapshot(input)
  const published = await publishBlocklistReadyMarkerIfGeneration({
    filter: input.filter,
    readyKey: input.readyKey,
    generation,
    value: newBloomReadyMarkerValue(),
  })
  if (!published) await enqueueRebuildBloomFilter({ filter: input.filter })
}

/** The snapshot cursor is already closed, so the hook cannot add rows to this rebuild. */
async function streamBlocklistThenAfterSnapshot(input: {
  stream: () => Promise<void>
  afterSnapshot?: () => Promise<void>
}): Promise<void> {
  await input.stream()
  await input.afterSnapshot?.()
}

async function publishBlocklistReadyMarkerIfGeneration(input: {
  filter: BlocklistBloomFilterName
  readyKey: string
  generation: string
  value: string
}): Promise<boolean> {
  const published = await bloomValkeyClient.invokeScript(
    publishBlocklistReadyMarkerIfGenerationScript,
    {
      keys: [blocklistBloomGenerationKey(input.filter), input.readyKey],
      args: [input.generation, input.value],
    },
  )
  return Number(published) === 1
}

function generationVisibleThrough(generation: string): string | undefined {
  return generationPattern.exec(generation)?.[2]
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
