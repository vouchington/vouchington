import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import { createPaginationParser } from '@modules/pagination'
import { isUUID } from '@modules/utils'
import { currentUserCanApplyVoteRingPenalty } from '@services/vote-integrity/authorization'
import {
  getVoteWeightPenalties,
  getVoteWeightPenaltiesByFlagIdFromPrimary,
  getVoteWeightPenaltyByIdFromPrimary,
  revokeVoteWeightPenalty,
  type GetVoteWeightPenaltiesOptions,
} from '@services/vote-integrity'
import { requireAuthAndRateLimit } from '../../response-helpers.mts'

const penaltiesParser = createPaginationParser({
  cursor: { type: 'simple' },
  limit: { default: 25, max: 100 },
})

// GET /api/v1/vote-integrity/penalties
app.route('/api/v1/vote-integrity/penalties').get(async (ctx: Context) => {
  await requireAuthAndRateLimit(
    ctx,
    currentUserCanApplyVoteRingPenalty,
    'GET:/api/v1/vote-integrity/penalties',
  )

  const { after, limit } = penaltiesParser.parse(ctx.query)
  const { status, source, user_id, source_flag_id } = ctx.query as Record<
    string,
    string | undefined
  >
  ctx.assert(!status || status === 'active' || status === 'revoked', 422, 'Invalid status')
  ctx.assert(!source || source === 'flag', 422, 'Invalid source')
  ctx.assert(!user_id || isUUID(user_id), 422, 'Invalid user_id')
  ctx.assert(!source_flag_id || isUUID(source_flag_id), 422, 'Invalid source_flag_id')

  const statusFilter = status === 'active' || status === 'revoked' ? status : undefined
  const sourceFilter = source === 'flag' ? source : undefined
  const queryOptions: GetVoteWeightPenaltiesOptions = {
    status: statusFilter,
    source: sourceFilter,
    userId: user_id,
    after,
    limit,
  }
  const result = source_flag_id
    ? await getVoteWeightPenaltiesByFlagIdFromPrimary({
        ...queryOptions,
        sourceFlagId: source_flag_id,
      })
    : await getVoteWeightPenalties(queryOptions)

  ctx.json(result)
})

// GET /api/v1/vote-integrity/penalties/:id
app.route('/api/v1/vote-integrity/penalties/:id').get(async (ctx: Context) => {
  await requireAuthAndRateLimit(
    ctx,
    currentUserCanApplyVoteRingPenalty,
    'GET:/api/v1/vote-integrity/penalties/:id',
  )
  ctx.assert(isUUID(ctx.params.id!), 422, 'Invalid penalty ID')
  const penalty = await getVoteWeightPenaltyByIdFromPrimary(ctx.params.id!)
  ctx.assert(penalty, 404, 'Penalty not found')
  ctx.json({ penalty })
})

// DELETE /api/v1/vote-integrity/penalties/:id
app.route('/api/v1/vote-integrity/penalties/:id').delete(async (ctx: Context) => {
  const currentUser = await requireAuthAndRateLimit(
    ctx,
    currentUserCanApplyVoteRingPenalty,
    'DELETE:/api/v1/vote-integrity/penalties/:id',
  )

  ctx.assert(isUUID(ctx.params.id!), 422, 'Invalid penalty ID')

  const penalty = await revokeVoteWeightPenalty(ctx.params.id!, currentUser.id)
  ctx.json({ penalty })
})
