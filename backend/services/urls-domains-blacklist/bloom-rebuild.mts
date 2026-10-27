import { bloomValkeyClient } from '@data-stores/valkey/clients'
import { loadScript, registerScript } from '@data-stores/valkey/scripts'
import { BLOOM_FILTER_DEFAULTS } from '@queues/bloom-filters/config'
import { enqueueRebuildBloomFilter } from '@queues/bloom-filters/enqueues'
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
  bumpedAt = Date.now(),
): Promise<string> {
  const value = await bloomValkeyClient.invokeScript(bumpBlocklistBloomGenerationScript, {
    keys: [blocklistBloomGenerationKey(filter)],
    args: [String(bumpedAt)],
  })
  return generationText(value)
}

async function readBlocklistBloomGeneration(filter: BlocklistBloomFilterName): Promise<string> {
  const value = await bloomValkeyClient.get(blocklistBloomGenerationKey(filter))
  if (value === null) return absentGeneration
  return generationText(value)
}

/** A bump younger than the replica-lag margin is not safe to snapshot yet. */
function blocklistBloomGenerationIsWithinReplicaLag(generation: string, now = Date.now()): boolean {
  const bumpedAt = generationBumpedAt(generation)
  if (bumpedAt === undefined) return false
  return now - bumpedAt < BLOOM_FILTER_DEFAULTS.replicaLagSafetyMarginMs
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
  if (blocklistBloomGenerationIsWithinReplicaLag(generation)) {
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

function generationBumpedAt(generation: string): number | undefined {
  const match = generationPattern.exec(generation)
  if (!match) return undefined
  const bumpedAt = Number(match[2])
  if (!Number.isSafeInteger(bumpedAt)) return undefined
  return bumpedAt
}

function generationText(value: unknown): string {
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'bigint' || Buffer.isBuffer(value)) {
    return value.toString()
  }
  return absentGeneration
}
