import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import {
  enqueueBlacklistDispatcher,
  enqueueSourceSync,
} from '@queues/urls-domains-blacklist/enqueues'
import { currentUserCanManageBlacklist } from '@services/urls-domains-blacklist/authorization'
import { parsePositiveBigintId } from '@ts-shared/utils/bigint-ids'
import { requireAuthAndRateLimit, validateRequestContract } from '../../response-helpers.mts'

type SourceSyncBody = Parameters<typeof enqueueSourceSync>[0]
type SourceSyncRequest = { sourceId: string | number }

// POST /api/v1/blacklist/dispatch - Trigger blacklist dispatcher
app.route('/api/v1/blacklist/dispatch').post(async (ctx: Context) => {
  await requireAuthAndRateLimit(
    ctx,
    currentUserCanManageBlacklist,
    'POST:/api/v1/blacklist/dispatch',
  )
  await enqueueBlacklistDispatcher()
  ctx.json({ success: true })
})

// POST /api/v1/blacklist/source-sync - Trigger source sync
app.route('/api/v1/blacklist/source-sync').post(async (ctx: Context) => {
  await requireAuthAndRateLimit(
    ctx,
    currentUserCanManageBlacklist,
    'POST:/api/v1/blacklist/source-sync',
  )
  const body = (await ctx.request.json('100kb')) as SourceSyncRequest
  validateRequestContract(ctx, 'POST:/api/v1/blacklist/source-sync', { body })
  const sourceId = parsePositiveBigintId(body.sourceId)
  ctx.assert(sourceId, 400, 'sourceId must be a positive integer')
  await enqueueSourceSync({ sourceId } satisfies SourceSyncBody)
  ctx.json({ success: true })
})
