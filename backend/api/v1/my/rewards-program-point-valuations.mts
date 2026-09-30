import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import { requireAuth, validateRequestContract } from '../../response-helpers.mts'
import { apiQuery } from '../../response-contract.mts'
import { createPaginationParser } from '@modules/pagination'
import {
  getIndividualRewardsProgramPointValuations,
  createIndividualRewardsProgramPointValuation,
  updateIndividualRewardsProgramPointValuationById,
  deleteIndividualRewardsProgramPointValuationById,
} from '@services/individuals-households'
import { assertNotSuspended } from '@services/users'
import type { ScaledMoney } from '@ts-shared/money'

type CreatePointValuationRequest = {
  rewards_program_id: string
  value_per_point: ScaledMoney
  note?: string | null
}

type UpdatePointValuationRequest = {
  value_per_point?: ScaledMoney
  note?: string | null
}

const pointValuationsPagination = createPaginationParser({
  cursor: { type: 'simple', paramName: 'after' },
  limit: { default: 25, max: 100 },
})

// GET /api/v1/my/rewards-program-point-valuations
//
// The query carrier is not schema-validated: the pagination parser owns limit clamping and
// malformed-cursor 400s, and the generated schema has no unknown-parameter or coercion rules.
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

  const body = (await ctx.request.json('10kb')) as CreatePointValuationRequest
  validateRequestContract(ctx, 'POST:/api/v1/my/rewards-program-point-valuations', { body })

  const valuation = await createIndividualRewardsProgramPointValuation(
    currentUser,
    currentUser,
    body.rewards_program_id,
    { value_per_point: body.value_per_point, note: body.note ?? undefined },
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

  const body = (await ctx.request.json('10kb')) as UpdatePointValuationRequest
  validateRequestContract(ctx, 'PATCH:/api/v1/my/rewards-program-point-valuations/:id', {
    path: ctx.params,
    body,
  })

  const valuation = await updateIndividualRewardsProgramPointValuationById(
    currentUser,
    currentUser,
    ctx.params.id!,
    { value_per_point: body.value_per_point, note: body.note },
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
  validateRequestContract(ctx, 'DELETE:/api/v1/my/rewards-program-point-valuations/:id', {
    path: ctx.params,
  })

  await deleteIndividualRewardsProgramPointValuationById(currentUser, currentUser, ctx.params.id!)

  ctx.setStatus(204)
})
