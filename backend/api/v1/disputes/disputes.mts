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
} from '@services/review-disputes'
import { isModerationStaff } from '@services/users'
import { apiQuery, apiResponse } from '../../response-contract.mts'
import {
  defineQueryContract,
  queryBoolean,
  queryEnum,
  queryInteger,
  queryString,
} from '@modules/pagination'
import {
  beforeIdFromCursor,
  parseAndValidateCaseListQuery,
  scopedPageInfo,
} from '../../case-list-query-helpers.mts'
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

  const { status, limit, after, mine } = parseAndValidateCaseListQuery(
    ctx,
    'GET:/api/v1/disputes',
    REVIEW_DISPUTE_STATUSES,
  )

  const disputantUserId = mine ? currentUser.id : undefined
  const isStaff = isModerationStaff(currentUser)
  const audience = isStaff ? 'staff' : 'member'
  const cursorScope = `disputes:${status}:${audience}:${disputantUserId ?? 'all'}:id-desc`

  const { disputes, hasNextPage } = await listReviewDisputes({
    status,
    limit,
    beforeId: beforeIdFromCursor(after, cursorScope),
    disputantUserId,
  })
  const viewerDisputes = await filterReviewDisputePostContentForViewer(currentUser, disputes)

  const page_info = scopedPageInfo(viewerDisputes, hasNextPage, cursorScope)
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
