import '@data-stores/valkey-core/app-integration'

import { Buffer } from 'node:buffer'
import type { GlideClient, GlideString } from '@valkey/valkey-glide'
import { expireKeysWithNoExpiry } from 'valkyries'
import { bloomValkeyClient } from './clients.mts'

export { normalizeBloomCheckResult, ValkeyBloomFilter } from 'valkyries/bloom-filter'

const BUILDING_KEY_SCAN_PATTERN = 'bloom-filter:*:building'
const BOOKMARK_LIVE_KEY_SCAN_PATTERN = 'bloom-filter:user-bookmarks:*'
const SCAN_COUNT = 500

// Generous headroom above any realistic single rebuild duration, comfortably shorter than the
// weekly rebuild cadence (backend/queues/bloom-filters/enqueues/schedules.mts): a truly-orphaned
// `:building` key self-clears well before next week's cycle, while the `HasNoExpiry` condition
// below never disturbs a `:building` key that is mid-legitimate-rebuild.
const ORPHANED_BUILDING_KEY_TTL_SECONDS = 60 * 60 * 24

/**
 * Attach a defensive TTL to any `bloom-filter:*:building` key left behind by a rebuild that died
 * mid-flight (e.g. a worker node wedged at Valkey `maxmemory` under `noeviction`, so the
 * `BF.RESERVE`/`BF.MADD` commands the rebuild depends on start failing before it can finish or
 * clean up after itself). `ValkeyBloomFilter.rebuildFromStream()` (in `valkyries`) deletes any
 * pre-existing `:building` key at the start of each rebuild and atomically RENAMEs the finished
 * build over the live key, but a `:building` key orphaned by a dead rebuild would otherwise sit
 * with no TTL until the next scheduled rebuild for that exact filter succeeds — up to a week
 * away, or never, if the node stays wedged.
 *
 * Uses `EXPIRE key <ttl> NX` ("set the expiry only if the key currently has none"), so this is
 * safe to call redundantly or concurrently (both the worker-io and worker-cpu deployments call
 * the shared `setup()`) and never shortens or otherwise disturbs a `:building` key that is
 * mid-rebuild — the eventual RENAME just moves a live key that happens to carry a TTL.
 */
export async function expireOrphanedBloomFilterBuildingKeys(
  client: GlideClient = bloomValkeyClient,
): Promise<void> {
  await expireKeysWithNoExpiry(client, {
    pattern: BUILDING_KEY_SCAN_PATTERN,
    ttl: ORPHANED_BUILDING_KEY_TTL_SECONDS,
    scanCount: SCAN_COUNT,
  })
}

/**
 * Attach a defensive TTL to any `bloom-filter:user-bookmarks:*` live key left behind by a backfill
 * that died between `rebuildFromStream()`'s atomic RENAME and the separate `Batch` that sets the
 * live key's own TTL (`backend/services/bookmarks/bloom-filter.mts`). Without this, such a key
 * would sit with no TTL forever on a shared `noeviction` instance rather than self-expiring within
 * `ttlSeconds`.
 *
 * The scan pattern also matches that same filter's `:building` key
 * (`valkyries` builds `bloom-filter:${name}` and `bloom-filter:${name}:building` off the same
 * name), so `:building` keys are excluded here and left to
 * `expireOrphanedBloomFilterBuildingKeys`'s own shorter TTL — otherwise this sweep would win the
 * `NX` race and pin a dead building key at `ttlSeconds` instead of
 * `ORPHANED_BUILDING_KEY_TTL_SECONDS`.
 *
 * Uses `EXPIRE key <ttl> NX`, so — like the building-key sweep — this is safe to call redundantly
 * or concurrently and never disturbs a live key that already carries a TTL.
 */
export async function expireBookmarkBloomFiltersMissingTtl(
  ttlSeconds: number,
  client: GlideClient = bloomValkeyClient,
): Promise<void> {
  await expireKeysWithNoExpiry(client, {
    pattern: BOOKMARK_LIVE_KEY_SCAN_PATTERN,
    ttl: ttlSeconds,
    scanCount: SCAN_COUNT,
    shouldExpire: key => !decodeKey(key).endsWith(':building'),
  })
}

function decodeKey(key: GlideString): string {
  // The upstream helper scans with Decoder.Bytes, so keep the Bloom-specific predicate decoder
  // local even though Voucha's own bloom client normally uses the default string decoder.
  return typeof key === 'string' ? key : Buffer.from(key).toString('utf8')
}
