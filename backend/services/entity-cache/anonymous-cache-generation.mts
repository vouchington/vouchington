import { randomUUID } from 'node:crypto'
import { primaryCacheValkeyClient } from '@data-stores/valkey/clients'

const GENERATION_KEY = 'anonymous-cache:legal-generation'

/** A shared namespace fence for anonymous origin caches after legal revocation. */
export async function getAnonymousCacheGeneration(): Promise<string> {
  const existing = await primaryCacheValkeyClient.get(GENERATION_KEY)
  if (existing) return String(existing)
  await primaryCacheValkeyClient.set(GENERATION_KEY, randomUUID(), {
    conditionalSet: 'onlyIfDoesNotExist',
  })
  const initialized = await primaryCacheValkeyClient.get(GENERATION_KEY)
  if (!initialized) throw new Error('Anonymous cache generation could not be initialized')
  return String(initialized)
}

/** Old in-flight fills remain in the prior namespace; legal delivery retries may call this again. */
export async function advanceAnonymousCacheGeneration(): Promise<void> {
  await primaryCacheValkeyClient.set(GENERATION_KEY, randomUUID())
}
