import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import {
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
  getTopicClaimById,
  getUnresolvedTopicClaimForClaimant,
  currentUserCanClaimTopic,
  getTopicClaimState,
} from '@services/topic-claims'
import { parseCreateTopicClaimInput } from '@services/topic-claims/parse'
import { getTopicByAny } from '@services/topics'
import { isModerationStaff } from '@services/users'
import type { TopicClaim } from '@services/topic-claims/config'

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

/** The four :claimId routes share this so a claim id cannot be read through another topic. */
async function requireClaimOnTopic(ctx: Context, claimId: string): Promise<TopicClaim> {
  const topic = await getTopicByAny(ctx.params.idOrSlug ?? '')
  ctx.assert(topic, 404, 'Topic not found')
  const claim = await getTopicClaimById(claimId)
  ctx.assert(claim, 404, 'Claim not found')
  ctx.assert(claim.topic_id === topic.id, 404, 'Claim not found')
  return claim
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

  const body = (await ctx.request.json('1mb')) as CreateTopicClaimBody
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
    await requireClaimOnTopic(ctx, claimId)

    const result = await issueDomainVerificationToken(currentUser.id, claimId)

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
    await requireClaimOnTopic(ctx, claimId)

    const claim = await verifyTopicClaimDomain(currentUser.id, claimId)

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
    await requireClaimOnTopic(ctx, claimId)
    const existingClaim = await getUnresolvedTopicClaimForClaimant(claimId, currentUser.id)
    ctx.assert(existingClaim, 404, 'Claim not found or already resolved')

    const body = (await ctx.request.json('1mb')) as SubmitTopicClaimManualReviewBody
    validateRequestContract(
      ctx,
      'POST:/api/v1/topics/:idOrSlug/claims/:claimId/manual-review-submission',
      {
        body,
      },
    )

    const claim = await submitTopicClaimForManualReview(currentUser.id, claimId, body.evidence)

    ctx.setStatus(200)
    ctx.json({ claim: claimBody(claim) })
  })

// GET /api/v1/topics/:idOrSlug/claims — list claims for a topic (staff or claimant)
app.route('/api/v1/topics/:idOrSlug/claims').get(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'GET:/api/v1/topics/:idOrSlug/claims')
  validateRequestContract(ctx, 'GET:/api/v1/topics/:idOrSlug/claims', { path: ctx.params })

  const idOrSlug = ctx.params.idOrSlug ?? ''
  ctx.assert(idOrSlug.length > 0, 422, 'idOrSlug is required')

  const topic = await getTopicByAny(idOrSlug)
  ctx.assert(topic, 404, 'Topic not found')

  const claims = await listTopicClaimsForTopic(topic.id)

  // Filter to only the current user's claims for non-staff
  const isStaff = isModerationStaff(currentUser)
  const responseClaims = isStaff
    ? claims
    : claims.filter(c => c.claimant_user_id === currentUser.id)

  ctx.json({ claims: responseClaims.map(claimBody) })
})

// GET /api/v1/topics/:idOrSlug/claims/:claimId — get a single claim
app.route('/api/v1/topics/:idOrSlug/claims/:claimId').get(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'GET:/api/v1/topics/:idOrSlug/claims/:claimId')
  validateRequestContract(ctx, 'GET:/api/v1/topics/:idOrSlug/claims/:claimId', { path: ctx.params })
  const claimId = validateUUIDParam(ctx, 'claimId')
  const claim = await requireClaimOnTopic(ctx, claimId)
  ctx.assert(
    isModerationStaff(currentUser) || claim.claimant_user_id === currentUser.id,
    404,
    'Claim not found',
  )

  ctx.json({ claim: claimBody(claim) })
})
