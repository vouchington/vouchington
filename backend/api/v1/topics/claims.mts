import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import { requireAuth, requireAuthAndRateLimit, validateUUIDParam } from '../../response-helpers.mts'
import {
  createTopicClaim,
  issueDomainVerificationToken,
  verifyTopicClaimDomain,
  submitTopicClaimForManualReview,
  listTopicClaimsForTopic,
  getTopicClaimById,
  currentUserCanClaimTopic,
  getTopicClaimState,
} from '@services/topic-claims'
import { parseCreateTopicClaimInput } from '@services/topic-claims/parse'

// POST /api/v1/topics/:idOrSlug/claims — submit a claim on a topic
app.route('/api/v1/topics/:idOrSlug/claims').post(async (ctx: Context) => {
  const currentUser = await requireAuthAndRateLimit(
    ctx,
    currentUserCanClaimTopic,
    'POST:/api/v1/topics/:idOrSlug/claims',
  )
  const idOrSlug = ctx.params.idOrSlug ?? ''
  ctx.assert(idOrSlug.length > 0, 422, 'idOrSlug is required')

  const body = (await ctx.request.json('1mb')) as Record<string, unknown>
  const input = parseCreateTopicClaimInput({ ...body, topic_id: idOrSlug })

  const { claim, isDuplicate } = await createTopicClaim(currentUser.id, input)

  ctx.setStatus(isDuplicate ? 200 : 201)
  ctx.json({ claim, isDuplicate })
})

// POST /api/v1/topics/:idOrSlug/claims/:claimId/verification-token — issue a DNS/file token
app
  .route('/api/v1/topics/:idOrSlug/claims/:claimId/verification-token')
  .post(async (ctx: Context) => {
    const currentUser = await requireAuth(
      ctx,
      'POST:/api/v1/topics/:idOrSlug/claims/:claimId/verification-token',
    )
    const claimId = validateUUIDParam(ctx, 'claimId')

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
    const claimId = validateUUIDParam(ctx, 'claimId')

    const claim = await verifyTopicClaimDomain(currentUser.id, claimId)

    ctx.setStatus(200)
    ctx.json({ claim })
  })

// POST /api/v1/topics/:idOrSlug/claims/:claimId/manual-review-submission — submit for manual review
app
  .route('/api/v1/topics/:idOrSlug/claims/:claimId/manual-review-submission')
  .post(async (ctx: Context) => {
    const currentUser = await requireAuth(
      ctx,
      'POST:/api/v1/topics/:idOrSlug/claims/:claimId/manual-review-submission',
    )
    const claimId = validateUUIDParam(ctx, 'claimId')
    const body = (await ctx.request.json('1mb')) as Record<string, unknown>
    const evidence = typeof body.evidence === 'string' ? body.evidence : ''

    const claim = await submitTopicClaimForManualReview(currentUser.id, claimId, evidence)

    ctx.setStatus(200)
    ctx.json({ claim })
  })

// GET /api/v1/topics/:idOrSlug/claims — list claims for a topic (staff or claimant)
app.route('/api/v1/topics/:idOrSlug/claims').get(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'GET:/api/v1/topics/:idOrSlug/claims')

  const idOrSlug = ctx.params.idOrSlug ?? ''
  ctx.assert(idOrSlug.length > 0, 422, 'idOrSlug is required')

  // Resolve topic to get its ID
  const { getTopicByAny } = await import('@services/topics')
  const topic = await getTopicByAny(idOrSlug)
  ctx.assert(topic, 404, 'Topic not found')

  const claims = await listTopicClaimsForTopic(topic.id)

  // Filter to only the current user's claims for non-staff
  const { isModerationStaff } = await import('@services/users')
  const isStaff = isModerationStaff(currentUser)
  const responseClaims = isStaff
    ? claims
    : claims.filter(c => c.claimant_user_id === currentUser.id)

  ctx.json({ claims: responseClaims.map(c => ({ ...c, state: getTopicClaimState(c) })) })
})

// GET /api/v1/topics/:idOrSlug/claims/:claimId — get a single claim
app.route('/api/v1/topics/:idOrSlug/claims/:claimId').get(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'GET:/api/v1/topics/:idOrSlug/claims/:claimId')
  const claimId = validateUUIDParam(ctx, 'claimId')

  const claim = await getTopicClaimById(claimId)
  ctx.assert(claim, 404, 'Claim not found')

  const { isModerationStaff } = await import('@services/users')
  const isStaff = isModerationStaff(currentUser)
  ctx.assert(isStaff || claim.claimant_user_id === currentUser.id, 403, 'Forbidden')

  ctx.json({ claim })
})
