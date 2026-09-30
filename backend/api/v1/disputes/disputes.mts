import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import { requireAuth, validateRequestContract, validateUUIDParam } from '../../response-helpers.mts'
import type { ApiUuidContract } from '../../request-contract-types.mts'
import { verifyCaptchaOrAttestation } from '@services/captcha'
import {
  parseCreateReviewDisputeInput,
  createReviewDispute,
  getReviewDisputeById,
  listReviewDisputes,
  redactReviewDispute,
  listRedactedReviewDisputes,
  REVIEW_DISPUTE_STATUSES,
  type ReviewDisputeReason,
  type ReviewDisputeStatus,
} from '@services/review-disputes'
import { isModerationStaff } from '@services/users'
import { apiQuery, apiResponse } from '../../response-contract.mts'
import {
  decodeScopedUuidCursor,
  defineQueryContract,
  encodeScopedUuidCursor,
  queryBoolean,
  queryEnum,
  queryInteger,
  queryString,
} from '@modules/pagination'
import { filterReviewDisputePostContentForViewer } from './dispute-post-content-visibility.mts'
import './disputes-staff.mts'

type CreateReviewDisputeRequest = {
  post_id: ApiUuidContract
  topic_id?: ApiUuidContract
  reason: ReviewDisputeReason
  claim_text: string
  cf_turnstile_response?: string
}

const disputesQuery = defineQueryContract({
  status: queryEnum(REVIEW_DISPUTE_STATUSES, {
    default: 'pending',
    description: 'Dispute status; unknown values use pending.',
  }),
  mine: queryBoolean({ description: 'Only disputes the caller filed.' }),
  limit: queryInteger({ minimum: 1, maximum: 100, default: 25 }),
  after: queryString(),
})

// POST /api/v1/disputes — file a review dispute
app.route('/api/v1/disputes').post(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'POST:/api/v1/disputes')

  const body = (await ctx.request.json('1mb')) as CreateReviewDisputeRequest
  validateRequestContract(ctx, 'POST:/api/v1/disputes', { body })
  await verifyCaptchaOrAttestation(ctx, body, { actionTag: 'disputes.create' })

  const input = parseCreateReviewDisputeInput(body)
  const { dispute, isDuplicate } = await createReviewDispute(currentUser, input)

  ctx.setStatus(isDuplicate ? 200 : 201)
  const [viewerDispute] = await filterReviewDisputePostContentForViewer(currentUser, [dispute])
  ctx.json({ dispute: redactReviewDispute(viewerDispute!), isDuplicate })
})

// GET /api/v1/disputes — list disputes (staff: full, member: redacted)
app.route('/api/v1/disputes').get(async (ctx: Context) => {
  apiQuery('GET:/api/v1/disputes', disputesQuery)
  const currentUser = await requireAuth(ctx, 'GET:/api/v1/disputes')

  // Unreadable limits and unknown statuses fall back to defaults, so the contract below checks the
  // settled values: it rejects only a fractional limit, which used to reach SQL and answer 500.
  const limitRaw = ctx.query.limit !== undefined ? Number(ctx.query.limit) : 25
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 100) : 25

  const statusParam = ctx.query.status
  const status: ReviewDisputeStatus =
    typeof statusParam === 'string' &&
    REVIEW_DISPUTE_STATUSES.includes(statusParam as ReviewDisputeStatus)
      ? (statusParam as ReviewDisputeStatus)
      : 'pending'

  const after = typeof ctx.query.after === 'string' ? ctx.query.after : undefined
  validateRequestContract(ctx, 'GET:/api/v1/disputes', {
    query: {
      status,
      limit,
      ...(ctx.query.mine === 'true' && { mine: true }),
      ...(after !== undefined && { after }),
    },
  })

  const disputantUserId = ctx.query.mine === 'true' ? currentUser.id : undefined
  const isStaff = isModerationStaff(currentUser)
  const audience = isStaff ? 'staff' : 'member'
  const cursorScope = `disputes:${status}:${audience}:${disputantUserId ?? 'all'}:id-desc`
  const beforeId =
    after !== undefined
      ? decodeScopedUuidCursor(after, cursorScope, 'Invalid cursor format').id
      : undefined

  const { disputes, hasNextPage } = await listReviewDisputes({
    status,
    limit,
    beforeId,
    disputantUserId,
  })
  const viewerDisputes = await filterReviewDisputePostContentForViewer(currentUser, disputes)

  const page_info = {
    has_next_page: hasNextPage,
    start_cursor: viewerDisputes[0]
      ? encodeScopedUuidCursor(viewerDisputes[0].id, cursorScope)
      : null,
    end_cursor:
      hasNextPage && viewerDisputes.at(-1)
        ? encodeScopedUuidCursor(viewerDisputes.at(-1)!.id, cursorScope)
        : null,
  }
  if (isStaff) {
    ctx.json(apiResponse('GET:/api/v1/disputes#staff', { disputes: viewerDisputes, page_info }))
    return
  }

  ctx.json({ disputes: listRedactedReviewDisputes(viewerDisputes), page_info })
})

// GET /api/v1/disputes/:id — get a single dispute
app.route('/api/v1/disputes/:id').get(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'GET:/api/v1/disputes/:id')
  const id = validateUUIDParam(ctx, 'id')
  validateRequestContract(ctx, 'GET:/api/v1/disputes/:id', { path: ctx.params })

  const dispute = await getReviewDisputeById(id)
  ctx.assert(dispute, 404, 'Dispute not found')
  const [viewerDispute] = await filterReviewDisputePostContentForViewer(currentUser, [dispute])

  const isStaff = isModerationStaff(currentUser)
  if (isStaff) {
    ctx.json(apiResponse('GET:/api/v1/disputes/:id#staff', { dispute: viewerDispute! }))
    return
  }

  ctx.json({ dispute: redactReviewDispute(viewerDispute!) })
})
