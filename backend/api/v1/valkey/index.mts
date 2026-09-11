import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import { currentUserCanAccessValkeyAdmin } from '@services/valkey-admin/authorization'
import {
  enqueueRebuildBloomFilter,
  enqueueRebuildEmbeddingBloomFilter,
  enqueueBackfillBloomFilter,
} from '@queues/bloom-filters/enqueues'
import {
  BLOOM_FILTER_REBUILD_INPUTS,
  type BloomFilterRebuildInput,
} from '@queues/bloom-filters/types'
import { getCacheGroups, clearCacheGroup, clearAllCaches } from '@services/valkey-admin/clear-cache'
import { FLUSH_CONCERNS, flushConcern, type FlushConcern } from '@services/valkey-admin/flush'
import { requireAuthAndRateLimit } from '../../response-helpers.mts'
import { flushQueues } from './queues-flush.mts'

// POST /api/v1/valkey/bloom-filters/rebuild - Trigger bloom filter rebuild
app.route('/api/v1/valkey/bloom-filters/rebuild').post(async (ctx: Context) => {
  await requireAuthAndRateLimit(
    ctx,
    currentUserCanAccessValkeyAdmin,
    'POST:/api/v1/valkey/bloom-filters/rebuild',
  )

  const body = (await ctx.request.json('1mb')) as Record<string, unknown>
  const filter = body.filter as string
  ctx.assert(
    BLOOM_FILTER_REBUILD_INPUTS.includes(filter as BloomFilterRebuildInput),
    400,
    `Invalid filter. Must be one of: ${BLOOM_FILTER_REBUILD_INPUTS.join(', ')}`,
  )

  switch (filter) {
    case 'url-blocklist':
    case 'email-blocklist':
      enqueueRebuildBloomFilter({ filter })
      break
    case 'embedding':
      enqueueRebuildEmbeddingBloomFilter()
      break
    case 'entity-cache':
      enqueueBackfillBloomFilter({ entityType: 'posts' })
      enqueueBackfillBloomFilter({ entityType: 'topics' })
      enqueueBackfillBloomFilter({ entityType: 'users' })
      enqueueBackfillBloomFilter({ entityType: 'rss_feed_items' })
      break
    case 'api-keys':
      enqueueRebuildBloomFilter({ filter: 'api-keys' })
      break
  }

  ctx.json({ success: true, filter })
})

// GET /api/v1/valkey/cache-groups - Get all cache groups
app.route('/api/v1/valkey/cache-groups').get(async (ctx: Context) => {
  await requireAuthAndRateLimit(
    ctx,
    currentUserCanAccessValkeyAdmin,
    'GET:/api/v1/valkey/cache-groups',
  )

  const groups = getCacheGroups()
  ctx.json({ groups })
})

// POST /api/v1/valkey/caches/clear - Clear a cache group or all caches
app.route('/api/v1/valkey/caches/clear').post(async (ctx: Context) => {
  await requireAuthAndRateLimit(
    ctx,
    currentUserCanAccessValkeyAdmin,
    'POST:/api/v1/valkey/caches/clear',
  )

  const body = (await ctx.request.json('1mb')) as Record<string, unknown>
  const group = body.group as string
  ctx.assert(group && typeof group === 'string', 400, 'Missing group')

  if (group === 'all') {
    await clearAllCaches()
  } else {
    await clearCacheGroup(group)
  }

  ctx.json({ success: true, group })
})

// POST /api/v1/valkey/flush - Scoped, per-concern Valkey key removal (never FLUSHDB)
app.route('/api/v1/valkey/flush').post(async (ctx: Context) => {
  await requireAuthAndRateLimit(ctx, currentUserCanAccessValkeyAdmin, 'POST:/api/v1/valkey/flush')

  const body = (await ctx.request.json('1mb')) as Record<string, unknown>
  const concern = body.concern as string
  const force = body.force === true
  ctx.assert(
    FLUSH_CONCERNS.includes(concern as (typeof FLUSH_CONCERNS)[number]),
    400,
    `Invalid concern. Must be one of: ${FLUSH_CONCERNS.join(', ')}`,
  )

  const result =
    concern === 'queues'
      ? await flushQueues()
      : await flushConcern(concern as Exclude<FlushConcern, 'queues'>, { force })

  ctx.json(result)
})
