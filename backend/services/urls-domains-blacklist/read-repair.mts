import { bloomValkeyClient } from '@data-stores/valkey'
import type { RebuildBloomFilterData } from '@queues/bloom-filters/types'
import { enqueueRebuildBloomFilterBestEffort } from './rebuild-enqueue.mts'
import onError from '@modules/on-error'

type RepairBloomFilterUnavailableReadOptions = {
  filter: RebuildBloomFilterData['filter']
  readyKey: string
  repairStaleReadyMarker: () => Promise<void>
}
type CheckBloomFilterReadOptions = {
  readyKey: string
  liveKey: string
  value: string
  existsIfReady: (readyKey: string, value: string) => Promise<boolean | null>
  repairUnavailableRead: () => Promise<void>
}

const DELETE_READY_MARKER_IF_UNREADABLE_SCRIPT = `
local keyType = redis.call('TYPE', KEYS[1])
if type(keyType) == 'table' then
  keyType = keyType['ok']
end

if keyType == 'list' or keyType == 'set' or keyType == 'zset' or keyType == 'hash' or keyType == 'stream' then
  return redis.call('DEL', KEYS[1])
end

return 0
`

export async function repairBloomFilterUnavailableRead({
  filter,
  readyKey,
  repairStaleReadyMarker,
}: RepairBloomFilterUnavailableReadOptions): Promise<void> {
  try {
    const readyMarkerKeyType = await getValkeyKeyType(readyKey)
    if (isUnreadableReadyMarkerKeyType(readyMarkerKeyType)) {
      enqueueRebuildBloomFilterBestEffort(filter)
      await deleteReadyMarkerIfUnreadable(readyKey)
      return
    }

    await repairStaleReadyMarker()
  } catch (error) {
    onError(error instanceof Error ? error : new Error(String(error)))
  }
}

type CheckBloomFiltersReadOptions = {
  readyKey: string
  liveKey: string
  values: string[]
  mexistsIfReady: (readyKey: string, values: string[]) => Promise<Array<boolean | null>>
  repairUnavailableRead: () => Promise<void>
}

export async function checkBloomFiltersRead({
  readyKey,
  liveKey,
  values,
  mexistsIfReady,
  repairUnavailableRead,
}: CheckBloomFiltersReadOptions): Promise<Array<boolean | null>> {
  if (values.length === 0) return []

  try {
    const results = await mexistsIfReady(readyKey, values)
    if (results.length !== values.length || results.some(result => result === null)) {
      await repairUnavailableRead()
      return values.map(() => null)
    }
    if (results.some(result => result === false) && (await isUnavailableLiveFilterKey(liveKey))) {
      await repairUnavailableRead()
      return values.map(() => null)
    }
    return results
  } catch (error) {
    onError(error instanceof Error ? error : new Error(String(error)))
    await repairUnavailableRead()
    return values.map(() => null)
  }
}

export async function checkBloomFilterRead({
  readyKey,
  liveKey,
  value,
  existsIfReady,
  repairUnavailableRead,
}: CheckBloomFilterReadOptions): Promise<boolean | null> {
  try {
    const result = await existsIfReady(readyKey, value)
    const unavailable =
      result === null || (result === false && (await isUnavailableLiveFilterKey(liveKey)))
    if (unavailable) {
      await repairUnavailableRead()
      return null
    }
    return result
  } catch (error) {
    onError(error instanceof Error ? error : new Error(String(error)))
    await repairUnavailableRead()
    return null
  }
}

export async function getValkeyKeyType(key: string): Promise<string> {
  const result = await bloomValkeyClient.customCommand(['TYPE', key])
  return normalizeValkeyKeyTypeForRepair(result, key)
}

export function normalizeValkeyKeyTypeForRepair(result: unknown, key: string): string {
  if (typeof result === 'string' || Buffer.isBuffer(result)) {
    return result.toString()
  }

  onError(new Error(`Unexpected Valkey TYPE response for ${key}`))
  return ''
}

export async function isUnavailableLiveFilterKey(liveKey: string): Promise<boolean> {
  const keyType = await getValkeyKeyType(liveKey)
  return /^(none|string|list|set|zset|hash|stream)$/.test(keyType)
}

function isUnreadableReadyMarkerKeyType(keyType: string): boolean {
  return /^(list|set|zset|hash|stream)$/.test(keyType)
}

async function deleteReadyMarkerIfUnreadable(key: string): Promise<number> {
  const result = await bloomValkeyClient.customCommand([
    'EVAL',
    DELETE_READY_MARKER_IF_UNREADABLE_SCRIPT,
    '1',
    key,
  ])
  return Number(result)
}
