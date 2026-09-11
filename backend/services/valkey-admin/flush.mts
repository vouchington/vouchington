import type { GlideClient } from '@valkey/valkey-glide'
import { RateLimiter } from '@data-stores/valkey-rate-limiter'
import { scanAndUnlinkKeys } from 'valkyries'
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

export { FLUSH_CONCERNS, type FlushConcern } from './concerns.mts'

export type FlushResult = {
  concern: FlushConcern
  keysRemoved: number | null
}

export type ScanBasedConcern = 'recently-viewed' | 'blooms' | 'dynamic-config' | 'sessions'

// Client + key pattern(s) for every concern whose removal mechanism is a plain SCAN+UNLINK, shared
// with the read-only diagnostic target registry so removal and diagnosis cannot drift apart.
const SCAN_BASED_CONCERN_PATTERNS: Record<
  ScanBasedConcern,
  { client: GlideClient; patterns: string[] }
> = {
  'recently-viewed': {
    client: cacheValkeyClient,
    patterns: SERVICE_FLUSH_TARGET_PREFIXES['recently-viewed'].map(prefix => `${prefix}*`),
  },
  blooms: {
    client: bloomValkeyClient,
    patterns: SERVICE_FLUSH_TARGET_PREFIXES.blooms.map(prefix => `${prefix}*`),
  },
  'dynamic-config': {
    client: dynamicConfigValkeyClient,
    patterns: SERVICE_FLUSH_TARGET_PREFIXES['dynamic-config'].map(prefix => `${prefix}*`),
  },
  sessions: {
    client: sessionValkeyClient,
    patterns: SERVICE_FLUSH_TARGET_PREFIXES.sessions.map(prefix => `${prefix}*`),
  },
}

/**
 * Every pattern's `scanAndUnlinkKeys()` already reports its own failure via `handleValkeyError`
 * before rethrowing, so callers must not wrap this in a second `onError` report.
 * A failure on one pattern (e.g. one of `sessions`' 9 prefixes) doesn't discard the key counts
 * already removed by the others: every pattern is still attempted unless cancellation requests
 * that no additional destructive work begin. When exactly one pattern fails, that error is
 * rethrown as-is; when 2+ fail, they're combined into an `AggregateError`.
 */
async function sumUnlinkedKeys(
  client: GlideClient,
  patterns: string[],
  signal?: AbortSignal,
): Promise<number> {
  let removed = 0
  const failures: unknown[] = []
  for (const pattern of patterns) {
    signal?.throwIfAborted()
    try {
      // oxlint-disable-next-line no-await-in-loop -- serial dispatch prevents cancellation from starting additional destructive prefix scans
      const { unlinkedKeys } = await scanAndUnlinkKeys(client, pattern, { signal })
      removed += unlinkedKeys
      signal?.throwIfAborted()
    } catch (error) {
      if (signal?.aborted && error === signal.reason) throw error
      failures.push(error)
    }
  }

  if (failures.length === 0) return removed
  if (failures.length === 1) throw failures[0]

  throw new AggregateError(
    failures,
    `${failures.length}/${patterns.length} key patterns failed to flush (${removed} keys removed from the rest)`,
  )
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
      const { client, patterns } = SCAN_BASED_CONCERN_PATTERNS[concern]
      const keysRemoved = await sumUnlinkedKeys(client, patterns, opts?.signal)
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
      const { client, patterns } = SCAN_BASED_CONCERN_PATTERNS.sessions
      const keysRemoved = await sumUnlinkedKeys(client, patterns, opts.signal)
      return { concern, keysRemoved }
    }

    default:
      throw createHttpError(400, `Invalid concern: ${concern}`)
  }
}
