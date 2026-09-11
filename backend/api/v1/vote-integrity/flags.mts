import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import { createPaginationParser } from '@modules/pagination'
import { isUUID } from '@modules/utils'
import {
  currentUserCanApplyVoteRingPenalty,
  currentUserCanReviewVoteIntegrityFlags,
} from '@services/vote-integrity/authorization'
import {
  getVoteIntegrityFlags,
  getVoteIntegrityFlagByIdFromPrimary,
  resolveVoteIntegrityFlag,
  applyVoteRingPenalty,
  INTEGRITY_FLAG_STATUSES,
  VOTE_INTEGRITY_RESOLUTIONS,
  type IntegrityFlagStatus,
  type VoteIntegrityResolution,
} from '@services/vote-integrity'
import { requireAuthAndRateLimit } from '../../response-helpers.mts'

const flagsParser = createPaginationParser({
  cursor: { type: 'simple' },
  limit: { default: 25, max: 100 },
})

// GET /api/v1/vote-integrity/flags
app.route('/api/v1/vote-integrity/flags').get(async (ctx: Context) => {
  await requireAuthAndRateLimit(
    ctx,
    currentUserCanReviewVoteIntegrityFlags,
    'GET:/api/v1/vote-integrity/flags',
  )

  const { after, limit } = flagsParser.parse(ctx.query)
  const { status } = ctx.query as Record<string, string | undefined>
  const statusFilter = INTEGRITY_FLAG_STATUSES.includes(status as IntegrityFlagStatus)
    ? (status as IntegrityFlagStatus)
    : undefined

  const result = await getVoteIntegrityFlags({
    status: statusFilter,
    after,
    limit,
  })

  ctx.json({ results: result.results, page_info: result.page_info })
})

// GET /api/v1/vote-integrity/flags/:id
app.route('/api/v1/vote-integrity/flags/:id').get(async (ctx: Context) => {
  await requireAuthAndRateLimit(
    ctx,
    currentUserCanReviewVoteIntegrityFlags,
    'GET:/api/v1/vote-integrity/flags/:id',
  )

  ctx.assert(isUUID(ctx.params.id!), 422, 'Invalid flag ID')

  const flag = await getVoteIntegrityFlagByIdFromPrimary(ctx.params.id!)
  ctx.assert(flag, 404, 'Flag not found')

  ctx.json({ flag })
})

// PATCH /api/v1/vote-integrity/flags/:id
app.route('/api/v1/vote-integrity/flags/:id').patch(async (ctx: Context) => {
  const currentUser = await requireAuthAndRateLimit(
    ctx,
    currentUserCanReviewVoteIntegrityFlags,
    'PATCH:/api/v1/vote-integrity/flags/:id',
  )

  ctx.assert(isUUID(ctx.params.id!), 422, 'Invalid flag ID')

  const body = await ctx.request.json('10kb')
  ctx.assert(
    body !== null && typeof body === 'object' && !Array.isArray(body),
    422,
    'Invalid request body',
  )
  const { resolution } = body as Record<string, unknown>
  ctx.assert(typeof resolution === 'string', 422, 'resolution is required')
  const resolutionAction = VOTE_INTEGRITY_RESOLUTIONS.includes(
    resolution as VoteIntegrityResolution,
  )
    ? (resolution as VoteIntegrityResolution)
    : null
  ctx.assert(resolutionAction, 422, 'resolution must be dismissed, penalized, or suspended')

  const flag = await resolveVoteIntegrityFlag(ctx.params.id!, currentUser.id, resolutionAction)
  ctx.json({ flag })
})

// POST /api/v1/vote-integrity/flags/:id/penalties
app.route('/api/v1/vote-integrity/flags/:id/penalties').post(async (ctx: Context) => {
  const currentUser = await requireAuthAndRateLimit(
    ctx,
    currentUserCanApplyVoteRingPenalty,
    'POST:/api/v1/vote-integrity/flags/:id/penalties',
  )

  ctx.assert(isUUID(ctx.params.id!), 422, 'Invalid flag ID')

  const result = await applyVoteRingPenalty(ctx.params.id!, currentUser.id)
  ctx.json(result)
})
