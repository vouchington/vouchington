import { parseRuntimePagination } from '@voucha/api/runtime-pagination'
import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import { requireAuth, validateRequestContract } from '../../response-helpers.mts'
import { apiQuery } from '../../response-contract.mts'
import { createPaginationParser } from '@modules/pagination'
import {
  getIndividualRewardsProgramStatuses,
  createIndividualRewardsProgramStatus,
  updateIndividualRewardsProgramStatusById,
  deleteIndividualRewardsProgramStatusById,
} from '@services/individuals-households'
import { assertNotSuspended } from '@services/users'
import { prepareQueryForValidation } from '@services/search-params/prepare-query'

type CreateRewardsProgramStatusRequest = { rewards_program_status_id: string }

type UpdateRewardsProgramStatusRequest = {
  started_on?: string | null
  expires_on?: string | null
}

const rewardsProgramStatusesPagination = createPaginationParser({
  cursor: { type: 'simple', paramName: 'after' },
  limit: { default: 25, max: 100 },
})

// GET /api/v1/my/rewards-program-statuses
app.route('/api/v1/my/rewards-program-statuses').get(async (ctx: Context) => {
  apiQuery('GET:/api/v1/my/rewards-program-statuses', rewardsProgramStatusesPagination)
  const currentUser = await requireAuth(ctx, 'GET:/api/v1/my/rewards-program-statuses')

  const options = parseRuntimePagination(rewardsProgramStatusesPagination, ctx.query)
  const query = prepareQueryForValidation(ctx.query, rewardsProgramStatusesPagination.queryContract)
  if (ctx.query.limit !== undefined) query.limit = options.limit
  validateRequestContract(ctx, 'GET:/api/v1/my/rewards-program-statuses', { query })
  ctx.json(await getIndividualRewardsProgramStatuses(currentUser, currentUser, options))
})

// POST /api/v1/my/rewards-program-statuses
app.route('/api/v1/my/rewards-program-statuses').post(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'POST:/api/v1/my/rewards-program-statuses')
  assertNotSuspended(currentUser)

  const body = (await ctx.request.json('10kb')) as CreateRewardsProgramStatusRequest
  validateRequestContract(ctx, 'POST:/api/v1/my/rewards-program-statuses', { body })

  const status = await createIndividualRewardsProgramStatus(
    currentUser,
    currentUser,
    body.rewards_program_status_id,
  )

  ctx.setStatus(201)
  ctx.json({ rewards_program_status: status })
})

// PATCH /api/v1/my/rewards-program-statuses/:id
app.route('/api/v1/my/rewards-program-statuses/:id').patch(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'PATCH:/api/v1/my/rewards-program-statuses/:id')
  assertNotSuspended(currentUser)

  const body = (await ctx.request.json('10kb')) as UpdateRewardsProgramStatusRequest
  validateRequestContract(ctx, 'PATCH:/api/v1/my/rewards-program-statuses/:id', {
    path: ctx.params,
    body,
  })

  const status = await updateIndividualRewardsProgramStatusById(
    currentUser,
    currentUser,
    ctx.params.id!,
    { started_on: body.started_on, expires_on: body.expires_on },
  )

  ctx.json({ rewards_program_status: status })
})

// DELETE /api/v1/my/rewards-program-statuses/:id
app.route('/api/v1/my/rewards-program-statuses/:id').delete(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'DELETE:/api/v1/my/rewards-program-statuses/:id')
  assertNotSuspended(currentUser)
  validateRequestContract(ctx, 'DELETE:/api/v1/my/rewards-program-statuses/:id', {
    path: ctx.params,
  })

  await deleteIndividualRewardsProgramStatusById(currentUser, currentUser, ctx.params.id!)

  ctx.setStatus(204)
})
