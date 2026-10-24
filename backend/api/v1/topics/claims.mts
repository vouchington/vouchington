import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import {
  parseJsonBody,
  requireAuth,
  requireAuthAndRateLimit,
  validateRequestContract,
  validateUUIDParam,
} from '../../response-helpers.mts'
import {
  createTopicClaim,
  issueDomainVerificationToken,
  verifyTopicClaimDomain,
  submitTopicClaimForManualReview,
  listTopicClaimsForTopic,
  getReadableTopicClaim,
  requireTopicClaimOnTopic,
  currentUserCanClaimTopic,
  getTopicClaimState,
} from '@services/topic-claims'
import { parseCreateTopicClaimInput } from '@services/topic-claims/parse'
import { getTopicByAny } from '@services/topics'
import { isModerationStaff } from '@services/users'
import type { TopicClaim } from '@services/topic-claims/config'
import { topicClaimFilters, topicClaimPageParser } from '@services/topic-claims/page-query'
import { parseRuntimePagination } from '@voucha/api/runtime-pagination'
import { apiQuery } from '../../api-query-contract.mts'
import { prepareQueryForValidation } from '@services/search-params/prepare-query'

type CreateTopicClaimBody = {
  claimed_role: string
  evidence?: string
}

type SubmitTopicClaimManualReviewBody = {
  evidence: string
}

function claimBody(claim: TopicClaim) {
  return { ...claim, state: getTopicClaimState(claim) }
}

// POST /api/v1/topics/:idOrSlug/claims — submit a claim on a topic
app.route('/api/v1/topics/:idOrSlug/claims').post(async (ctx: Context) => {
  const currentUser = await requireAuthAndRateLimit(
    ctx,
    currentUserCanClaimTopic,
    'POST:/api/v1/topics/:idOrSlug/claims',
  )
  validateRequestContract(ctx, 'POST:/api/v1/topics/:idOrSlug/claims', { path: ctx.params })
  const idOrSlug = ctx.params.idOrSlug ?? ''
  ctx.assert(idOrSlug.length > 0, 422, 'idOrSlug is required')

  const body = (await parseJsonBody(ctx, '1mb')) as CreateTopicClaimBody
  validateRequestContract(ctx, 'POST:/api/v1/topics/:idOrSlug/claims', {
    body,
  })
  const input = parseCreateTopicClaimInput({ ...body, topic_id: idOrSlug })

  const { claim, isDuplicate } = await createTopicClaim(currentUser.id, input)

  ctx.setStatus(isDuplicate ? 200 : 201)
  ctx.json({ claim: claimBody(claim), isDuplicate })
})

// POST /api/v1/topics/:idOrSlug/claims/:claimId/verification-token — issue a DNS/file token
app
  .route('/api/v1/topics/:idOrSlug/claims/:claimId/verification-token')
  .post(async (ctx: Context) => {
    const currentUser = await requireAuth(
      ctx,
      'POST:/api/v1/topics/:idOrSlug/claims/:claimId/verification-token',
    )
    validateRequestContract(
      ctx,
      'POST:/api/v1/topics/:idOrSlug/claims/:claimId/verification-token',
      {
        path: ctx.params,
      },
    )
    const claimId = validateUUIDParam(ctx, 'claimId')
    const claimContext = await requireTopicClaimOnTopic(ctx.params.idOrSlug ?? '', claimId)
    const result = await issueDomainVerificationToken(currentUser.id, claimContext)

    ctx.setStatus(200)
    ctx.json(result)
  })

// POST /api/v1/topics/:idOrSlug/claims/:claimId/domain-verification — attempt domain verify
app
  .route('/api/v1/topics/:idOrSlug/claims/:claimId/domain-verification')
  .post(async (ctx: Context) => {
    const currentUser = await requireAuthAndRateLimit(
      ctx,
      user => user !== null,
      'POST:/api/v1/topics/:idOrSlug/claims/:claimId/domain-verification',
    )
    validateRequestContract(
      ctx,
      'POST:/api/v1/topics/:idOrSlug/claims/:claimId/domain-verification',
      {
        path: ctx.params,
      },
    )
    const claimId = validateUUIDParam(ctx, 'claimId')
    const claimContext = await requireTopicClaimOnTopic(ctx.params.idOrSlug ?? '', claimId)
    const claim = await verifyTopicClaimDomain(currentUser.id, claimContext)

    ctx.setStatus(200)
    ctx.json({ claim: claimBody(claim) })
  })

// POST /api/v1/topics/:idOrSlug/claims/:claimId/manual-review-submission — submit for manual review
app
  .route('/api/v1/topics/:idOrSlug/claims/:claimId/manual-review-submission')
  .post(async (ctx: Context) => {
    const currentUser = await requireAuth(
      ctx,
      'POST:/api/v1/topics/:idOrSlug/claims/:claimId/manual-review-submission',
    )
    validateRequestContract(
      ctx,
      'POST:/api/v1/topics/:idOrSlug/claims/:claimId/manual-review-submission',
      { path: ctx.params },
    )
    const claimId = validateUUIDParam(ctx, 'claimId')
    const claimContext = await requireTopicClaimOnTopic(ctx.params.idOrSlug ?? '', claimId)
    ctx.assert(claimContext.claim.claimant_user_id === currentUser.id, 404, 'Claim not found')
    ctx.assert(
      !claimContext.claim.verified_at && !claimContext.claim.rejected_at,
      404,
      'Claim not found or already resolved',
    )

    const body = (await parseJsonBody(ctx, '1mb')) as SubmitTopicClaimManualReviewBody
    validateRequestContract(
      ctx,
      'POST:/api/v1/topics/:idOrSlug/claims/:claimId/manual-review-submission',
      {
        body,
      },
    )

    const claim = await submitTopicClaimForManualReview(currentUser.id, claimContext, body.evidence)

    ctx.setStatus(200)
    ctx.json({ claim: claimBody(claim) })
  })

// GET /api/v1/topics/:idOrSlug/claims — list claims for a topic (staff or claimant)
app.route('/api/v1/topics/:idOrSlug/claims').get(async (ctx: Context) => {
  apiQuery('GET:/api/v1/topics/:idOrSlug/claims', topicClaimPageParser, topicClaimFilters)
  const currentUser = await requireAuth(ctx, 'GET:/api/v1/topics/:idOrSlug/claims')
  const options = parseRuntimePagination(topicClaimPageParser, ctx.query)
  const query = prepareQueryForValidation(ctx.query, {
    ...topicClaimPageParser.queryContract,
    ...topicClaimFilters.queryContract,
  })
  if (ctx.query.limit !== undefined) query.limit = options.limit
  validateRequestContract(ctx, 'GET:/api/v1/topics/:idOrSlug/claims', {
    path: ctx.params,
    query,
  })

  const idOrSlug = ctx.params.idOrSlug ?? ''
  ctx.assert(idOrSlug.length > 0, 422, 'idOrSlug is required')

  const topic = await getTopicByAny(idOrSlug)
  ctx.assert(topic, 404, 'Topic not found')

  const isStaff = isModerationStaff(currentUser)
  const mineOnly = query.mine_only === true
  const page = await listTopicClaimsForTopic(topic.id, {
    ...options,
    claimantUserId: isStaff && !mineOnly ? undefined : currentUser.id,
    activeOnly: query.active_only === true,
  })
  ctx.json({ results: page.results.map(claimBody), page_info: page.page_info })
})

// GET /api/v1/topics/:idOrSlug/claims/:claimId — get a single claim
app.route('/api/v1/topics/:idOrSlug/claims/:claimId').get(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'GET:/api/v1/topics/:idOrSlug/claims/:claimId')
  validateRequestContract(ctx, 'GET:/api/v1/topics/:idOrSlug/claims/:claimId', { path: ctx.params })
  const claimId = validateUUIDParam(ctx, 'claimId')
  const claim = await getReadableTopicClaim(currentUser, ctx.params.idOrSlug ?? '', claimId)

  ctx.json({ claim: claimBody(claim) })
})
