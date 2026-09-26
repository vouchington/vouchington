import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import {
  getOptionalAuthAndRateLimit,
  requireAuth,
  validateRequestContract,
} from '../../response-helpers.mts'
import {
  getCommunityOrThrow,
  getCommunityMember,
  getApplicationQuestions,
  setApplicationQuestions,
  currentUserCanUpdateCommunity,
  type ApplicationQuestionInput,
} from '@services/communities'
import { HTTP_CACHE_SHORT_MAX_AGE_SECONDS } from '@voucha/config'

app
  .route('/api/v1/communities/:idOrSlug/application-questions')
  .get(async (ctx: Context) => {
    const currentUser = await getOptionalAuthAndRateLimit(
      ctx,
      'GET:/api/v1/communities/:idOrSlug/application-questions',
    )
    validateRequestContract(ctx, 'GET:/api/v1/communities/:idOrSlug/application-questions', {
      path: ctx.params,
    })
    const { idOrSlug } = ctx.params as { idOrSlug: string }

    const community = await getCommunityOrThrow(idOrSlug)

    const questions = await getApplicationQuestions(community.id)

    if (!currentUser) {
      ctx.set('Cache-Control', `public, max-age=${HTTP_CACHE_SHORT_MAX_AGE_SECONDS}`)
    }

    ctx.json({ questions })
  })
  .put(async (ctx: Context) => {
    const currentUser = await requireAuth(
      ctx,
      'PUT:/api/v1/communities/:idOrSlug/application-questions',
    )

    const { idOrSlug } = ctx.params as { idOrSlug: string }
    const community = await getCommunityOrThrow(idOrSlug)

    const membership = await getCommunityMember(community.id, currentUser.id)
    ctx.assert(currentUserCanUpdateCommunity(currentUser, community, membership), 403, 'Forbidden')

    const body = (await ctx.request.json('1mb')) as { questions: ApplicationQuestionInput[] }
    validateRequestContract(ctx, 'PUT:/api/v1/communities/:idOrSlug/application-questions', {
      path: ctx.params,
      body,
    })

    const questions = await setApplicationQuestions(currentUser.id, community.id, body.questions)

    ctx.json({ questions })
  })
