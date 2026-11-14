import { randomUUID } from 'node:crypto'
import { primaryCacheValkeyClient } from '@data-stores/valkey/clients'

const GENERATION_KEY = 'rss_public_post_snapshots:legal_generation'

/** Missing/evicted generation keys get a fresh namespace, never a reused default. */
export async function getRssSnapshotLegalGeneration(): Promise<string> {
  const current = await primaryCacheValkeyClient.get(GENERATION_KEY)
  if (current !== null) return String(current)
  const generation = randomUUID()
  const inserted = await primaryCacheValkeyClient.set(GENERATION_KEY, generation, {
    conditionalSet: 'onlyIfDoesNotExist',
  })
  if (inserted) return generation
  const winner = await primaryCacheValkeyClient.get(GENERATION_KEY)
  if (winner === null) throw new Error('RSS legal snapshot generation is unavailable')
  return String(winner)
}

/** Legal removal only: advance before edge purging, including durable retries. */
export async function invalidateRssSnapshotsForLegalRemoval(): Promise<void> {
  await primaryCacheValkeyClient.set(GENERATION_KEY, randomUUID())
}
