import app from '../../../app.mts'
import { streamJsonObject, type Context } from '@jongleberry/api-server'
import { isAdminUser } from '@services/users'
import {
  requireAuthAndRateLimit,
  parseJsonBody,
  validateRequestContract,
} from '../../../response-helpers.mts'
import { importAdminTopics } from '@services/admin-imports/topic-import'

/**
 * POST /api/v1/imports/topics — Batch create/update topics via import queue.
 * Accepts a JSON body `{ csv: string }`. Upserts by slug.
 * Validates all rows first. If any row is invalid, returns validation errors with no DB writes.
 * If all rows are valid, creates a batch record and enqueues one job per row.
 */
app.route('/api/v1/imports/topics').post(async (ctx: Context) => {
  const currentUser = await requireAuthAndRateLimit(ctx, isAdminUser, 'POST:/api/v1/imports/topics')

  // 4mb comfortably fits 1000 rows of realistic topic data (markdown descriptions) without
  // rejecting valid admin batches, while staying well under the former 10mb cap. The endpoint
  // is admin-only and rate-limited, so the event-loop cost of parsing is bounded.
  const body = await parseJsonBody<{ csv?: unknown }>(ctx, '4mb')
  ctx.assert(
    body !== null && typeof body === 'object' && !Array.isArray(body),
    400,
    'Invalid JSON body',
  )
  validateRequestContract(ctx, 'POST:/api/v1/imports/topics', { body })
  const { csv } = body
  ctx.assert(typeof csv === 'string', 400, 'csv must be a string')
  const result = await importAdminTopics(currentUser, csv)
  ctx.setType('json')
  if (result.valid) {
    ctx.setStatus(201)
    await ctx.pipeline(streamJsonObject({ valid: true, batch: result.batch }))
    return
  }
  ctx.setStatus(422)
  if ('error' in result) await ctx.pipeline(streamJsonObject({ valid: false, error: result.error }))
  else await ctx.pipeline(streamJsonObject({ valid: false, validation: result.validation }))
})
