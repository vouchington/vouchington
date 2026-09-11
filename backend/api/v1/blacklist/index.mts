import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import {
  enqueueBlacklistDispatcher,
  enqueueSourceSync,
} from '@queues/urls-domains-blacklist/enqueues'
import { currentUserCanManageBlacklist } from '@services/urls-domains-blacklist/authorization'
import { parsePositiveBigintId } from '@ts-shared/utils/bigint-ids'
import { requireAuthAndRateLimit } from '../../response-helpers.mts'

type SourceSyncBody = Parameters<typeof enqueueSourceSync>[0]

// POST /api/v1/blacklist/dispatch - Trigger blacklist dispatcher
app.route('/api/v1/blacklist/dispatch').post(async (ctx: Context) => {
  await requireAuthAndRateLimit(
    ctx,
    currentUserCanManageBlacklist,
    'POST:/api/v1/blacklist/dispatch',
  )
  enqueueBlacklistDispatcher()
  ctx.json({ success: true })
})

// POST /api/v1/blacklist/source-sync - Trigger source sync
app.route('/api/v1/blacklist/source-sync').post(async (ctx: Context) => {
  await requireAuthAndRateLimit(
    ctx,
    currentUserCanManageBlacklist,
    'POST:/api/v1/blacklist/source-sync',
  )
  const body = await ctx.request.json('100kb')
  ctx.assert(body !== null && typeof body === 'object' && 'sourceId' in body, 400)
  const sourceId = parsePositiveBigintId((body as { sourceId?: unknown }).sourceId)
  ctx.assert(sourceId, 400, 'sourceId must be a positive integer')
  enqueueSourceSync({ sourceId } satisfies SourceSyncBody)
  ctx.json({ success: true })
})
