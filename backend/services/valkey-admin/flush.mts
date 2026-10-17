import type { GlideClient } from '@valkey/valkey-glide'
import { RateLimiter } from '@data-stores/valkey-rate-limiter'
import { scanAndUnlinkKeyPrefixes } from 'valkyries'
import {
  bloomValkeyClient,
  cacheValkeyClient,
  dynamicConfigValkeyClient,
  rateLimiterValkeyClient,
  sessionValkeyClient,
} from '@data-stores/valkey/clients'
import createHttpError from 'http-errors'
import { clearAllCaches } from './clear-cache.mts'
import type { FlushConcern, ServiceFlushConcern } from './concerns.mts'
import { SERVICE_FLUSH_TARGET_PREFIXES } from './flush-targets.mts'

export type { FlushConcern } from './concerns.mts'

export type FlushResult = {
  concern: FlushConcern
  keysRemoved: number | null
}

export type ScanBasedConcern = 'recently-viewed' | 'blooms' | 'dynamic-config' | 'sessions'

// Client + literal key prefixes for every concern whose removal mechanism is a plain SCAN+UNLINK,
// shared with the read-only diagnostic target registry so removal and diagnosis cannot drift apart.
// `scanAndUnlinkKeyPrefixes` already reports each failing prefix through valkyries' error handler
// (routed to onError by app-integration), so callers must not report again. It attempts every
// prefix unless cancellation arrives, rethrows a single failure as-is, and combines 2+ failures
// into an `AggregateError`.
const SCAN_BASED_CONCERN_TARGETS: Record<
  ScanBasedConcern,
  { client: GlideClient; prefixes: readonly string[] }
> = {
  'recently-viewed': {
    client: cacheValkeyClient,
    prefixes: SERVICE_FLUSH_TARGET_PREFIXES['recently-viewed'],
  },
  blooms: { client: bloomValkeyClient, prefixes: SERVICE_FLUSH_TARGET_PREFIXES.blooms },
  'dynamic-config': {
    client: dynamicConfigValkeyClient,
    prefixes: SERVICE_FLUSH_TARGET_PREFIXES['dynamic-config'],
  },
  sessions: { client: sessionValkeyClient, prefixes: SERVICE_FLUSH_TARGET_PREFIXES.sessions },
}

/**
 * Flushes exactly one Valkey concern's keys, never a blunt `FLUSHDB` — the keyspace is flat (every
 * concern's client can fall back to the same physical Valkey URL/db 0, see
 * `@data-stores/valkey-core/config`), so an enumerated per-concern prefix is a safety requirement,
 * not a stylistic choice. `queues` is handled at the API/script layer, not here (services must
 * never import from `api/`) — excluded from this function's parameter type so passing it is a
 * compile-time error; the `default` case below only guards against a caller that bypasses the type
 * via `as`.
 */
export async function flushConcern(
  concern: ServiceFlushConcern,
  opts?: { force?: boolean; signal?: AbortSignal },
): Promise<FlushResult> {
  switch (concern) {
    case 'caches': {
      opts?.signal?.throwIfAborted()
      await clearAllCaches()
      opts?.signal?.throwIfAborted()
      return { concern, keysRemoved: null }
    }

    case 'recently-viewed':
    case 'blooms':
    case 'dynamic-config': {
      const { client, prefixes } = SCAN_BASED_CONCERN_TARGETS[concern]
      const { unlinkedKeys: keysRemoved } = await scanAndUnlinkKeyPrefixes(client, prefixes, {
        signal: opts?.signal,
      })
      return { concern, keysRemoved }
    }

    case 'rate-limiter': {
      opts?.signal?.throwIfAborted()
      await RateLimiter.invalidate('', rateLimiterValkeyClient)
      opts?.signal?.throwIfAborted()
      return { concern, keysRemoved: null }
    }

    case 'sessions': {
      if (!opts?.force) throw createHttpError(400, 'Flushing sessions requires force: true')
      const { client, prefixes } = SCAN_BASED_CONCERN_TARGETS.sessions
      const { unlinkedKeys: keysRemoved } = await scanAndUnlinkKeyPrefixes(client, prefixes, {
        signal: opts.signal,
      })
      return { concern, keysRemoved }
    }

    default:
      throw createHttpError(400, `Invalid concern: ${concern}`)
  }
}
