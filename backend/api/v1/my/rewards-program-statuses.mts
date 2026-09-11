import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import { requireAuth } from '../../response-helpers.mts'
import { apiQuery } from '../../response-contract.mts'
import { createPaginationParser } from '@modules/pagination'
import {
  getIndividualRewardsProgramStatuses,
  createIndividualRewardsProgramStatus,
  updateIndividualRewardsProgramStatusById,
  deleteIndividualRewardsProgramStatusById,
} from '@services/individuals-households'
import { assertNotSuspended } from '@services/users'

const rewardsProgramStatusesPagination = createPaginationParser({
  cursor: { type: 'simple', paramName: 'after' },
  limit: { default: 25, max: 100 },
})

// GET /api/v1/my/rewards-program-statuses
app.route('/api/v1/my/rewards-program-statuses').get(async (ctx: Context) => {
  apiQuery('GET:/api/v1/my/rewards-program-statuses', rewardsProgramStatusesPagination)
  const currentUser = await requireAuth(ctx, 'GET:/api/v1/my/rewards-program-statuses')
  const page = await getIndividualRewardsProgramStatuses(
    currentUser,
    currentUser,
    rewardsProgramStatusesPagination.parse(ctx.query),
  )
  ctx.json(page)
})

// POST /api/v1/my/rewards-program-statuses
app.route('/api/v1/my/rewards-program-statuses').post(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'POST:/api/v1/my/rewards-program-statuses')
  assertNotSuspended(currentUser)

  const body = (await ctx.request.json('10kb')) as Record<string, unknown>
  ctx.assert(
    typeof body.rewards_program_status_id === 'string',
    400,
    'rewards_program_status_id is required',
  )

  const status = await createIndividualRewardsProgramStatus(
    currentUser,
    currentUser,
    body.rewards_program_status_id as string,
  )

  ctx.setStatus(201)
  ctx.json({ rewards_program_status: status })
})

// PATCH /api/v1/my/rewards-program-statuses/:id
app.route('/api/v1/my/rewards-program-statuses/:id').patch(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'PATCH:/api/v1/my/rewards-program-statuses/:id')
  assertNotSuspended(currentUser)

  const id = ctx.params.id!
  ctx.assert(id, 400, 'id is required')

  const body = (await ctx.request.json('10kb')) as Record<string, unknown>

  if ('since' in body && body.since !== null && body.since !== undefined) {
    ctx.assert(typeof body.since === 'string', 422, 'since must be a string')
  }
  if ('until' in body && body.until !== null && body.until !== undefined) {
    ctx.assert(typeof body.until === 'string', 422, 'until must be a string')
  }

  const status = await updateIndividualRewardsProgramStatusById(currentUser, currentUser, id, {
    since: 'since' in body ? (body.since as string | null | undefined) : undefined,
    until: 'until' in body ? (body.until as string | null | undefined) : undefined,
  })

  ctx.json({ rewards_program_status: status })
})

// DELETE /api/v1/my/rewards-program-statuses/:id
app.route('/api/v1/my/rewards-program-statuses/:id').delete(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'DELETE:/api/v1/my/rewards-program-statuses/:id')
  assertNotSuspended(currentUser)

  const id = ctx.params.id!
  ctx.assert(id, 400, 'id is required')

  await deleteIndividualRewardsProgramStatusById(currentUser, currentUser, id)

  ctx.setStatus(204)
})
