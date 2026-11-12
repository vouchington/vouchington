import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import { defineQueryContract, queryInteger } from '@vouchington/pagination'
import { enqueueCreateImageEmbeddingsBatch } from '@queues/gemini-embeddings-batch/enqueues'
import onError from '@modules/on-error'
import { findCopyrightImageSimilarityCandidates } from '@services/embeddings-batch/image-similarity'
import {
  currentUserCanReviewCopyrightNotices,
  reviewCopyrightStaydownMatch,
} from '@services/copyright-notices'
import { replayCopyrightDeliveryIntentAndEnqueue } from '@services/copyright-notices/copyright-mcp-write-actions'
import { parseCopyrightSimilarityCandidateLimit } from '@services/copyright-notices/moderator-http-input'
import { assertNotSuspended } from '@services/users'
import { setPrivateNoStoreCacheHeaders } from '../../cache-headers.mts'
import { apiQuery } from '../../api-query-contract.mts'
import {
  requireAuthAndRateLimit,
  validateRequestContract,
  validateUUIDParam,
} from '../../response-helpers.mts'
import { apiNoRequestBody } from '@vouchington/utils/api-response-contract'

// The limit stays lenient: a malformed or out-of-range value is ignored and the default applies, so
// the contract validates the value the parser settled on rather than the raw query string.
const similarityCandidateQueryContract = defineQueryContract({
  limit: queryInteger(
    { minimum: 1, maximum: 50 },
    {
      description: 'Maximum candidates to return. A malformed or out-of-range value is ignored.',
    },
  ),
})

app
  .route('/api/v1/copyright-notices/:id/targets/:targetId/image-similarity-candidates')
  .get(async (ctx: Context) => {
    apiQuery(
      'GET:/api/v1/copyright-notices/:id/targets/:targetId/image-similarity-candidates',
      similarityCandidateQueryContract,
    )
    setPrivateNoStoreCacheHeaders(ctx)
    const currentUser = await requireAuthAndRateLimit(
      ctx,
      currentUserCanReviewCopyrightNotices,
      'GET:/api/v1/copyright-notices/:id/targets/:targetId/image-similarity-candidates',
    )
    assertNotSuspended(currentUser)
    const noticeId = validateUUIDParam(ctx, 'id')
    const targetId = validateUUIDParam(ctx, 'targetId')
    const limit = parseCopyrightSimilarityCandidateLimit(ctx.query.limit)
    validateRequestContract(
      ctx,
      'GET:/api/v1/copyright-notices/:id/targets/:targetId/image-similarity-candidates',
      { path: ctx.params, query: limit === undefined ? {} : { limit } },
    )
    const result = await findCopyrightImageSimilarityCandidates({
      noticeId,
      targetId,
      limit,
    })
    ctx.assert(result.sourceImageId, 404, 'Copyright notice target not found')
    if (result.availability === 'unavailable') void enqueueMissingSourceImageEmbedding()
    ctx.json({
      availability: result.availability,
      copyright_image_similarity_candidates: result.candidates.map(candidate => ({
        placement_id: candidate.placementId,
        placement_revision: candidate.placementRevision,
        image_id: candidate.imageId,
        post_id: candidate.postId,
        similarity: candidate.similarity,
      })),
    })
  })

app
  .route('/api/v1/copyright-notices/:id/delivery-intents/:intentId/replays')
  .post(async (ctx: Context) => {
    apiNoRequestBody('POST:/api/v1/copyright-notices/:id/delivery-intents/:intentId/replays')
    setPrivateNoStoreCacheHeaders(ctx)
    const currentUser = await requireAuthAndRateLimit(
      ctx,
      currentUserCanReviewCopyrightNotices,
      'POST:/api/v1/copyright-notices/:id/delivery-intents/:intentId/replays',
    )
    assertNotSuspended(currentUser)
    const noticeId = validateUUIDParam(ctx, 'id')
    const intentId = validateUUIDParam(ctx, 'intentId')
    validateRequestContract(
      ctx,
      'POST:/api/v1/copyright-notices/:id/delivery-intents/:intentId/replays',
      { path: ctx.params },
    )
    ctx.json(await replayCopyrightDeliveryIntentAndEnqueue(currentUser, noticeId, intentId))
  })

app
  .route('/api/v1/copyright-notices/:id/staydown-matches/:matchId/reviews')
  .post(async (ctx: Context) => {
    apiNoRequestBody('POST:/api/v1/copyright-notices/:id/staydown-matches/:matchId/reviews')
    setPrivateNoStoreCacheHeaders(ctx)
    const currentUser = await requireAuthAndRateLimit(
      ctx,
      currentUserCanReviewCopyrightNotices,
      'POST:/api/v1/copyright-notices/:id/staydown-matches/:matchId/reviews',
    )
    assertNotSuspended(currentUser)
    const noticeId = validateUUIDParam(ctx, 'id')
    const matchId = validateUUIDParam(ctx, 'matchId')
    validateRequestContract(
      ctx,
      'POST:/api/v1/copyright-notices/:id/staydown-matches/:matchId/reviews',
      { path: ctx.params },
    )
    const reviewed = await reviewCopyrightStaydownMatch({
      noticeId,
      matchId,
      actorUserId: currentUser.id,
    })
    ctx.json({ reviewed })
  })

async function enqueueMissingSourceImageEmbedding(): Promise<void> {
  try {
    await enqueueCreateImageEmbeddingsBatch()
  } catch (err) {
    onError(
      err instanceof Error
        ? err
        : new Error('Failed to enqueue source image embedding batch', {
            cause: err,
          }),
    )
  }
}
