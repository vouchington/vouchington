import { write } from '@data-stores/psql'
import { CACHE_TTLS_SECONDS } from './config.mts'
import { caches } from './caches.mts'
import { deleteFromCachesInChunks } from './invalidate.mts'
import { entityCacheWorkConfig, getEntityCacheWorkLimit } from './work-limits.mts'
import { enqueueBulkPurgeCacheTags } from '@queues/cache-purge/enqueues'
import { hostnameTag } from '@ts-shared/cache'

type ClaimedHostname = {
  url_hostname_id: string
  hostname: string
  generation: string
  lease_token: string
}

type DrainOptions = {
  hostnameIds?: readonly string[]
  evict?: (item: ClaimedHostname) => Promise<void>
}

/** One bounded pass; the scheduled sweep resumes outstanding work on its next tick. */
export async function drainHostnameCacheInvalidationWork(
  options: DrainOptions = {},
): Promise<number> {
  if (options.hostnameIds?.length === 0) return 0
  await entityCacheWorkConfig.waitForInitialization()
  const limit = getEntityCacheWorkLimit('delete_keys_per_batch')
  const hostnameIds = options.hostnameIds
  const claimed = await pruneAndClaimHostnameCacheInvalidations(limit, hostnameIds)
  if (claimed.length === 0) return 0
  let firstFailure: Error | undefined
  try {
    if (options.evict) {
      for (const item of claimed) {
        // oxlint-disable-next-line no-await-in-loop -- test-injected eviction follows the claimed page.
        await options.evict(item)
      }
    } else {
      await evictHostnamePolicyCaches(claimed)
    }
  } catch (err) {
    firstFailure = err instanceof Error ? err : new Error(String(err))
  }
  if (firstFailure) await deferHostnameCacheInvalidations(claimed)
  else await acknowledgeHostnameCacheInvalidations(claimed)
  if (firstFailure) throw firstFailure
  return claimed.length
}

async function pruneAndClaimHostnameCacheInvalidations(
  limit: number,
  hostnameIds?: readonly string[],
): Promise<ClaimedHostname[]> {
  await pruneExpiredHostnameCacheInvalidationWork(limit, hostnameIds)
  return claimExpiredThenAvailableHostnameCacheInvalidations(limit, hostnameIds)
}

async function claimExpiredThenAvailableHostnameCacheInvalidations(
  limit: number,
  hostnameIds?: readonly string[],
): Promise<ClaimedHostname[]> {
  const expired = await claimHostnameCacheInvalidations('expired', limit, hostnameIds)
  const available = await claimHostnameCacheInvalidations(
    'available',
    limit - expired.length,
    hostnameIds,
  )
  return [...expired, ...available]
}

async function acknowledgeHostnameCacheInvalidations(items: ClaimedHostname[]): Promise<void> {
  await write(
    `/* drainHostnameCacheInvalidationWork:complete */
    WITH completed AS MATERIALIZED (
      SELECT * FROM jsonb_to_recordset($1::jsonb) AS input(
        url_hostname_id uuid, generation bigint, lease_token uuid)
    ), completed_ids AS MATERIALIZED (
      SELECT array_agg(url_hostname_id) AS ids FROM completed
    )
    DELETE FROM url_hostname_cache_invalidation_work_items work
    USING completed, completed_ids
    WHERE work.url_hostname_id = ANY(completed_ids.ids)
      AND work.url_hostname_id = completed.url_hostname_id
      AND work.generation = completed.generation
      AND work.lease_token = completed.lease_token
      AND work.lease_expires_at > CURRENT_TIMESTAMP`,
    [JSON.stringify(items)],
  )
}

async function deferHostnameCacheInvalidations(items: ClaimedHostname[]): Promise<void> {
  await write(
    `/* drainHostnameCacheInvalidationWork:fail */
    WITH failed AS MATERIALIZED (
      SELECT * FROM jsonb_to_recordset($1::jsonb) AS input(
        url_hostname_id uuid, generation bigint, lease_token uuid)
    ), failed_ids AS MATERIALIZED (
      SELECT array_agg(url_hostname_id) AS ids FROM failed
    )
    UPDATE url_hostname_cache_invalidation_work_items work
    SET lease_token = NULL, leased_at = NULL, lease_expires_at = NULL,
        available_at = CURRENT_TIMESTAMP +
          (LEAST(300, power(2, LEAST(attempt_count, 8))) * INTERVAL '1 second')
    FROM failed, failed_ids
    WHERE work.url_hostname_id = ANY(failed_ids.ids)
      AND work.url_hostname_id = failed.url_hostname_id
      AND work.generation = failed.generation
      AND work.lease_token = failed.lease_token
      AND work.lease_expires_at > CURRENT_TIMESTAMP`,
    [JSON.stringify(items)],
  )
}

async function claimHostnameCacheInvalidations(
  kind: 'available' | 'expired',
  limit: number,
  hostnameIds?: readonly string[],
): Promise<ClaimedHostname[]> {
  if (limit === 0) return []
  const predicate =
    kind === 'available'
      ? 'lease_token IS NULL AND available_at <= CURRENT_TIMESTAMP'
      : 'lease_token IS NOT NULL AND lease_expires_at <= CURRENT_TIMESTAMP AND available_at <= CURRENT_TIMESTAMP'
  const order = kind === 'available' ? 'available_at' : 'lease_expires_at'
  const scope = hostnameIds ? 'AND url_hostname_id = ANY($2::uuid[])' : ''
  const statement = `/* no-mistakes: deadlock-safe -- SKIP LOCKED never waits for other work-table claimers; the bounded page locks only work rows. */
    WITH picked AS MATERIALIZED (
      SELECT url_hostname_id FROM url_hostname_cache_invalidation_work_items
      WHERE ${predicate} ${scope}
      ORDER BY ${order}, url_hostname_id
      LIMIT $1::int FOR UPDATE SKIP LOCKED
    ), picked_ids AS MATERIALIZED (
      SELECT array_agg(url_hostname_id) AS ids FROM picked
    )
    UPDATE url_hostname_cache_invalidation_work_items work
    SET lease_token = uuidv7(), leased_at = CURRENT_TIMESTAMP,
        lease_expires_at = CURRENT_TIMESTAMP + INTERVAL '5 minutes',
        attempt_count = attempt_count + 1
    FROM picked_ids, url_hostnames hostname
    WHERE work.url_hostname_id = ANY(picked_ids.ids)
      AND hostname.id = work.url_hostname_id
    RETURNING work.url_hostname_id, hostname.hostname, work.generation::text,
      work.lease_token`
  const values = hostnameIds ? [limit, hostnameIds] : [limit]
  const { rows } =
    kind === 'available'
      ? await write<ClaimedHostname>(
          `/* drainHostnameCacheInvalidationWork:claimAvailable */\n${statement}`,
          values,
        )
      : await write<ClaimedHostname>(
          `/* drainHostnameCacheInvalidationWork:claimExpired */\n${statement}`,
          values,
        )
  return rows
}

async function evictHostnamePolicyCaches(items: ClaimedHostname[]): Promise<void> {
  const keys = items.flatMap(item => [item.url_hostname_id, item.hostname])
  await deleteFromCachesInChunks([
    { cache: caches.url_hostnames, keys },
    { cache: caches.email_domain_validation, keys: items.map(item => item.hostname) },
  ])
  await enqueueBulkPurgeCacheTags(keys.map(hostnameTag))
}

async function pruneExpiredHostnameCacheInvalidationWork(
  limit: number,
  hostnameIds?: readonly string[],
): Promise<void> {
  const scope = hostnameIds ? 'AND url_hostname_id = ANY($3::uuid[])' : ''
  await write(
    `/* drainHostnameCacheInvalidationWork:prune */
    /* no-mistakes: deadlock-safe -- SKIP LOCKED skips concurrent claims and deletion locks only the picked work rows. */
    WITH expired AS MATERIALIZED (
      SELECT url_hostname_id FROM url_hostname_cache_invalidation_work_items
      WHERE enqueued_at < CURRENT_TIMESTAMP - ($1::int * INTERVAL '1 second')
        AND lease_token IS NULL ${scope}
      ORDER BY enqueued_at, url_hostname_id LIMIT $2::int FOR UPDATE SKIP LOCKED
    ), expired_ids AS MATERIALIZED (
      SELECT array_agg(url_hostname_id) AS ids FROM expired
    )
    DELETE FROM url_hostname_cache_invalidation_work_items work
    USING expired_ids WHERE work.url_hostname_id = ANY(expired_ids.ids)`,
    hostnameIds
      ? [
          Math.max(CACHE_TTLS_SECONDS.url_hostnames, CACHE_TTLS_SECONDS.email_domain_validation),
          limit,
          hostnameIds,
        ]
      : [
          Math.max(CACHE_TTLS_SECONDS.url_hostnames, CACHE_TTLS_SECONDS.email_domain_validation),
          limit,
        ],
  )
}
