import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import { currentUserCanAccessValkeyAdmin } from '@services/valkey-admin/authorization'
import {
  enqueueRebuildBloomFilter,
  enqueueRebuildEmbeddingBloomFilter,
  enqueueBackfillBloomFilter,
} from '@queues/bloom-filters/enqueues'
import type { BloomFilterRebuildInput } from '@queues/bloom-filters/types'
import { getCacheGroups, clearCacheGroup, clearAllCaches } from '@services/valkey-admin/clear-cache'
import { flushConcern, type FlushConcern } from '@services/valkey-admin/flush'
import { requireAuthAndRateLimit, validateRequestContract } from '../../response-helpers.mts'
import { flushQueues } from './queues-flush.mts'

type BloomFilterRebuildRequest = { filter: BloomFilterRebuildInput }
type ClearCacheRequest = { group: string }
type FlushRequest = { concern: FlushConcern; force?: boolean }

// POST /api/v1/valkey/bloom-filters/rebuild - Trigger bloom filter rebuild
app.route('/api/v1/valkey/bloom-filters/rebuild').post(async (ctx: Context) => {
  await requireAuthAndRateLimit(
    ctx,
    currentUserCanAccessValkeyAdmin,
    'POST:/api/v1/valkey/bloom-filters/rebuild',
  )

  const body = (await ctx.request.json('1mb')) as BloomFilterRebuildRequest
  validateRequestContract(ctx, 'POST:/api/v1/valkey/bloom-filters/rebuild', { body })
  const { filter } = body

  switch (filter) {
    case 'url-blocklist':
    case 'email-blocklist':
      await enqueueRebuildBloomFilter({ filter })
      break
    case 'embedding':
      await enqueueRebuildEmbeddingBloomFilter()
      break
    case 'entity-cache':
      await Promise.all([
        enqueueBackfillBloomFilter({ entityType: 'posts' }),
        enqueueBackfillBloomFilter({ entityType: 'topics' }),
        enqueueBackfillBloomFilter({ entityType: 'users' }),
        enqueueBackfillBloomFilter({ entityType: 'rss_feed_items' }),
      ])
      break
    case 'api-keys':
      await enqueueRebuildBloomFilter({ filter: 'api-keys' })
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

  const body = (await ctx.request.json('1mb')) as ClearCacheRequest
  validateRequestContract(ctx, 'POST:/api/v1/valkey/caches/clear', { body })
  const { group } = body

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

  const body = (await ctx.request.json('1mb')) as FlushRequest
  validateRequestContract(ctx, 'POST:/api/v1/valkey/flush', { body })
  const { concern } = body
  const force = body.force === true

  const result = concern === 'queues' ? await flushQueues() : await flushConcern(concern, { force })

  ctx.json(result)
})
