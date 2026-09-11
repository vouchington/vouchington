import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import { requireAuth } from '../../response-helpers.mts'
import { apiQuery } from '../../response-contract.mts'
import { createPaginationParser } from '@modules/pagination'
import {
  getIndividualRewardsProgramPointValuations,
  createIndividualRewardsProgramPointValuation,
  updateIndividualRewardsProgramPointValuationById,
  deleteIndividualRewardsProgramPointValuationById,
} from '@services/individuals-households'
import { assertNotSuspended } from '@services/users'
import { isScaledMoney, type ScaledMoney } from '@ts-shared/money'

const pointValuationsPagination = createPaginationParser({
  cursor: { type: 'simple', paramName: 'after' },
  limit: { default: 25, max: 100 },
})

// GET /api/v1/my/rewards-program-point-valuations
app.route('/api/v1/my/rewards-program-point-valuations').get(async (ctx: Context) => {
  apiQuery('GET:/api/v1/my/rewards-program-point-valuations', pointValuationsPagination)
  const currentUser = await requireAuth(ctx, 'GET:/api/v1/my/rewards-program-point-valuations')

  const options = pointValuationsPagination.parse(ctx.query)
  const page = await getIndividualRewardsProgramPointValuations(currentUser, currentUser, options)
  ctx.json(page)
})

// POST /api/v1/my/rewards-program-point-valuations
app.route('/api/v1/my/rewards-program-point-valuations').post(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'POST:/api/v1/my/rewards-program-point-valuations')
  assertNotSuspended(currentUser)

  const body = (await ctx.request.json('10kb')) as Record<string, unknown>
  ctx.assert(typeof body.rewards_program_id === 'string', 400, 'rewards_program_id is required')
  ctx.assert('value_per_point' in body, 400, 'value_per_point is required')
  ctx.assert(
    isScaledMoney(body.value_per_point),
    422,
    'value_per_point must be valid scale-six money',
  )
  if ('note' in body && body.note !== undefined && body.note !== null) {
    ctx.assert(typeof body.note === 'string', 422, 'note must be a string or null')
  }

  const valuation = await createIndividualRewardsProgramPointValuation(
    currentUser,
    currentUser,
    body.rewards_program_id as string,
    {
      value_per_point: body.value_per_point as ScaledMoney,
      note: typeof body.note === 'string' ? body.note : undefined,
    },
  )

  ctx.setStatus(201)
  ctx.json({ point_valuation: valuation })
})

// PATCH /api/v1/my/rewards-program-point-valuations/:id
app.route('/api/v1/my/rewards-program-point-valuations/:id').patch(async (ctx: Context) => {
  const currentUser = await requireAuth(
    ctx,
    'PATCH:/api/v1/my/rewards-program-point-valuations/:id',
  )
  assertNotSuspended(currentUser)

  const id = ctx.params.id!
  ctx.assert(id, 400, 'id is required')

  const body = (await ctx.request.json('10kb')) as Record<string, unknown>
  if ('value_per_point' in body) {
    ctx.assert(
      isScaledMoney(body.value_per_point),
      422,
      'value_per_point must be valid scale-six money',
    )
  }
  if ('note' in body && body.note !== undefined && body.note !== null) {
    ctx.assert(typeof body.note === 'string', 422, 'note must be a string or null')
  }

  const valuation = await updateIndividualRewardsProgramPointValuationById(
    currentUser,
    currentUser,
    id,
    {
      value_per_point:
        'value_per_point' in body ? (body.value_per_point as ScaledMoney) : undefined,
      note: 'note' in body ? (body.note as string | null | undefined) : undefined,
    },
  )

  ctx.json({ point_valuation: valuation })
})

// DELETE /api/v1/my/rewards-program-point-valuations/:id
app.route('/api/v1/my/rewards-program-point-valuations/:id').delete(async (ctx: Context) => {
  const currentUser = await requireAuth(
    ctx,
    'DELETE:/api/v1/my/rewards-program-point-valuations/:id',
  )
  assertNotSuspended(currentUser)

  const id = ctx.params.id!
  ctx.assert(id, 400, 'id is required')

  await deleteIndividualRewardsProgramPointValuationById(currentUser, currentUser, id)

  ctx.setStatus(204)
})
