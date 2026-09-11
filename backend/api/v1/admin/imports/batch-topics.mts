import app from '../../../app.mts'
import { streamJsonObject, type Context } from '@jongleberry/api-server'
import { isAdminUser } from '@services/users'
import { requireAuthAndRateLimit, parseJsonBody } from '../../../response-helpers.mts'
import { parseCsvRows } from '@modules/csv'
import { validateTopicRows, validateTopicHeaders, createImportBatch } from '@services/admin-imports'
import { enqueueBulkImportRows } from '@queues/admin-imports/enqueues'

const MAX_ROWS = 1000

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
  const { csv } = body
  ctx.assert(typeof csv === 'string', 400, 'csv must be a string')
  ctx.assert(csv.trim().length > 0, 400, 'CSV body must not be empty')

  let rows: Record<string, string>[]
  try {
    rows = parseCsvRows(csv)
  } catch {
    ctx.throw(400, 'Invalid CSV format')
  }

  ctx.assert(rows.length > 0, 400, 'CSV must contain at least one data row')
  ctx.assert(rows.length <= MAX_ROWS, 400, `CSV must not exceed ${MAX_ROWS} rows`)

  // Validate headers (column allowlist)
  const headers = rows.length > 0 ? Object.keys(rows[0]) : []
  const unknownColumns = validateTopicHeaders(headers)
  if (unknownColumns.length > 0) {
    ctx.setStatus(422)
    ctx.setType('json')
    await ctx.pipeline(
      streamJsonObject({
        valid: false,
        error: `Unknown CSV columns: ${unknownColumns.join(', ')}`,
      }),
    )
    return
  }

  const validation = validateTopicRows(rows)

  if (!validation.valid) {
    ctx.setStatus(422)
    ctx.setType('json')
    await ctx.pipeline(
      streamJsonObject({
        valid: false,
        validation,
      }),
    )
    return
  }

  const { batch, rowIds } = await createImportBatch(
    currentUser,
    'topic',
    rows as Record<string, unknown>[],
  )
  await enqueueBulkImportRows(rowIds.map(rowId => ({ batchId: batch.id, rowId })))

  ctx.setStatus(201)
  ctx.setType('json')
  await ctx.pipeline(
    streamJsonObject({
      valid: true,
      batch: {
        id: batch.id,
        import_type: batch.import_type,
        total_rows: batch.total_rows,
        created_at: batch.created_at,
      },
    }),
  )
})
