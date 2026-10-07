import { bloomValkeyClient } from '@data-stores/valkey'
import { enqueueRebuildBloomFilter } from '@queues/bloom-filters/enqueues'
import type { RebuildBloomFilterData } from '@queues/bloom-filters/types'
import onError from '@modules/on-error'
import { normalizeDomain } from './normalize-domain.mts'
import { unlinkReadyMarkerIfValue } from './ready-marker.mts'
import { enqueueRebuildBloomFilterBestEffort } from './rebuild-enqueue.mts'
import { isUnavailableLiveFilterKey, repairBloomFilterUnavailableRead } from './read-repair.mts'

type BlocklistFilterName = Extract<
  RebuildBloomFilterData['filter'],
  'url-blocklist' | 'email-blocklist'
>
type ReadyMarkerValue = Exclude<Awaited<ReturnType<typeof bloomValkeyClient.get>>, null>

export type BlocklistBloomAddTarget = {
  addOrThrow: (domains: string[]) => Promise<void>
  filter: BlocklistFilterName
  readyKey: string
  repairStaleReadyMarker: () => Promise<void>
}

export type BlocklistBloomFilterReadTarget = {
  readyKey: string
  liveKey: string
  existsIfReady: (readyKey: string, value: string) => Promise<boolean | null>
  repairUnavailableRead: () => Promise<void>
}

type OwnedBlocklistBloomFilter = {
  getKey: () => string
  existsIfReady: (readyKey: string, value: string) => Promise<boolean | null>
  addOrThrow: (domains: string[]) => Promise<void>
}

// Parallel backend forks and the in-process bloom-filter worker share the global
// url-blocklist and email-blocklist keys. Callers that need a stable recovery
// observation pass a filter whose keys no other fork mutates.
export function blocklistBloomAddTarget(input: {
  filter: BlocklistFilterName
  readyKey: string
  liveKey: string
  addOrThrow: OwnedBlocklistBloomFilter['addOrThrow']
}): BlocklistBloomAddTarget {
  return {
    addOrThrow: input.addOrThrow,
    filter: input.filter,
    readyKey: input.readyKey,
    repairStaleReadyMarker: () =>
      repairStaleBlocklistReadyMarker({
        filter: input.filter,
        readyKey: input.readyKey,
        liveKey: input.liveKey,
      }),
  }
}

export function blocklistBloomReadTarget(input: {
  filter: BlocklistFilterName
  readyKey: string
  bloomFilter: OwnedBlocklistBloomFilter
}): BlocklistBloomFilterReadTarget {
  return {
    readyKey: input.readyKey,
    liveKey: input.bloomFilter.getKey(),
    existsIfReady: (readyKey, value) => input.bloomFilter.existsIfReady(readyKey, value),
    repairUnavailableRead: () =>
      repairBloomFilterUnavailableRead({
        filter: input.filter,
        readyKey: input.readyKey,
        repairStaleReadyMarker: () =>
          repairStaleBlocklistReadyMarker({
            filter: input.filter,
            readyKey: input.readyKey,
            liveKey: input.bloomFilter.getKey(),
          }),
      }),
  }
}

export async function addDomainsToBlocklistBloomFilter(
  domains: string[],
  target: BlocklistBloomAddTarget,
): Promise<void> {
  const validDomains = domains.flatMap(domain => {
    const normalized = normalizeDomain(domain)
    return normalized !== null ? [normalized] : []
  })

  try {
    await target.addOrThrow(validDomains)
  } catch (err) {
    reportError(err)
    await recoverBlocklistBloomFilterAfterAddFailure(target)
  }
}

export async function repairStaleBlocklistReadyMarker(input: {
  filter: BlocklistFilterName
  readyKey: string
  liveKey: string
}): Promise<void> {
  try {
    const readyValue = await bloomValkeyClient.get(input.readyKey)
    if (readyValue === null) return

    if (await isUnavailableLiveFilterKey(input.liveKey)) {
      void enqueueRebuildBloomFilterBestEffort(input.filter, () =>
        unlinkReadyMarkerIfValue(input.readyKey, readyValue),
      )
      await unlinkReadyMarkerIfValue(input.readyKey, readyValue)
    }
  } catch (err) {
    reportError(err)
  }
}

async function recoverBlocklistBloomFilterAfterAddFailure(
  target: BlocklistBloomAddTarget,
): Promise<void> {
  try {
    const readyValue = await readReadyMarkerOrRepair(target)
    if (readyValue === null) return

    await enqueueRebuildBloomFilter({ filter: target.filter })
    await unlinkReadyMarkerIfValue(target.readyKey, readyValue)
  } catch (err) {
    reportError(err)
  }
}

async function readReadyMarkerOrRepair(
  target: BlocklistBloomAddTarget,
): Promise<ReadyMarkerValue | null> {
  try {
    return await bloomValkeyClient.get(target.readyKey)
  } catch (err) {
    reportError(err)
    await repairBloomFilterUnavailableRead({
      filter: target.filter,
      readyKey: target.readyKey,
      repairStaleReadyMarker: target.repairStaleReadyMarker,
    })
    return null
  }
}

function reportError(err: unknown): void {
  onError(err instanceof Error ? err : new Error(String(err)))
}
