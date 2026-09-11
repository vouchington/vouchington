import { cacheValkeyClient } from '@data-stores/valkey/clients'
import { ValkeyCache } from '@data-stores/valkey/cache'
import createHttpError from 'http-errors'
import onError from '@modules/on-error'
import { CACHE_FLUSH_PREFIXES, CACHE_GROUPS } from './flush-targets.mts'

type CacheGroup = {
  name: string
  prefixes: string[]
}

export function getCacheGroups(): CacheGroup[] {
  return CACHE_GROUPS.map(group => ({ name: group.name, prefixes: [...group.prefixes] }))
}

export async function clearCacheGroup(group: string): Promise<void> {
  const prefixes = CACHE_GROUPS.find(candidate => candidate.name === group)?.prefixes
  if (!prefixes) throw createHttpError(400, `Invalid cache group: ${group}`)

  try {
    await ValkeyCache.invalidateMany([...prefixes], cacheValkeyClient)
  } catch (error) {
    onError(error instanceof Error ? error : new Error(String(error)))
    throw error
  }
}

export async function clearAllCaches(): Promise<void> {
  try {
    await ValkeyCache.invalidateMany(CACHE_FLUSH_PREFIXES, cacheValkeyClient)
  } catch (error) {
    onError(error instanceof Error ? error : new Error(String(error)))
    throw error
  }
}
