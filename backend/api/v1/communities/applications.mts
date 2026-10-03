import app from '../../app.mts'
import { apiQuery } from '../../response-contract.mts'
import { streamJsonObject, type Context } from '@jongleberry/api-server'
import { requireAuth, validateRequestContract } from '../../response-helpers.mts'
import {
  getCommunityOrThrow,
  loadCommunityForModerator,
  searchApplications,
  createApplication,
  approveApplication,
  rejectApplication,
} from '@services/communities'
import { indexById } from '@modules/utils'
import { getRequestContentProvenance } from '@modules/request-client-info/content-provenance'
import { communityApplicationsQuery, communityPageQueryInput } from './query-contracts-helpers.mts'

app
  .route('/api/v1/communities/:idOrSlug/applications')
  .get(async (ctx: Context) => {
    apiQuery('GET:/api/v1/communities/:idOrSlug/applications', communityApplicationsQuery)
    const currentUser = await requireAuth(ctx, 'GET:/api/v1/communities/:idOrSlug/applications')

    const { idOrSlug } = ctx.params as { idOrSlug: string }
    const { community } = await loadCommunityForModerator(currentUser, idOrSlug)
    validateRequestContract(ctx, 'GET:/api/v1/communities/:idOrSlug/applications', {
      path: ctx.params,
    })

    const limit = ctx.query.limit ? Number(ctx.query.limit) : undefined
    const after = ctx.query.after as string | undefined
    const rawStatus = ctx.query.status
    const status =
      rawStatus === 'pending' || rawStatus === 'approved' || rawStatus === 'rejected'
        ? rawStatus
        : undefined
    validateRequestContract(ctx, 'GET:/api/v1/communities/:idOrSlug/applications', {
      query: { ...communityPageQueryInput(ctx.query), ...(status ? { status } : {}) },
    })

    const result = await searchApplications(community.id, { limit, after, status })

    const searchResults = result.results.map(a => ({
      __entity_type: 'community_application' as const,
      id: a.id,
    }))

    const output: Record<string, unknown> = {
      results: searchResults,
      page_info: result.page_info,
      community_applications: indexById(result.results),
    }

    ctx.setType('json')
    await ctx.pipeline(streamJsonObject(output))
  })
  .post(async (ctx: Context) => {
    const currentUser = await requireAuth(ctx, 'POST:/api/v1/communities/:idOrSlug/applications')
    const provenance = getRequestContentProvenance()

    const { idOrSlug } = ctx.params as { idOrSlug: string }
    const community = await getCommunityOrThrow(idOrSlug)

    const body = (await ctx.request.json('1mb')) as {
      answers: Record<string, unknown>
      message?: string
    }
    validateRequestContract(ctx, 'POST:/api/v1/communities/:idOrSlug/applications', {
      path: ctx.params,
      body,
    })

    let message: string | undefined
    // The contract types `message` as a string (not nullable), so a present value is
    // already guaranteed to be a string here; only the omitted case still needs a check.
    if (body.message !== undefined) {
      const trimmed = body.message.trim()
      if (trimmed.length > 0) {
        ctx.assert(trimmed.length <= 5000, 422, 'message must be 5000 characters or fewer')
        message = trimmed
      }
    }

    const application = await createApplication(
      currentUser.id,
      provenance,
      community.id,
      body.answers,
      message,
    )

    ctx.setStatus(201)
    ctx.json({ community_application: application })
  })

app.route('/api/v1/communities/:idOrSlug/applications/:id').patch(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'PATCH:/api/v1/communities/:idOrSlug/applications/:id')

  const { idOrSlug, id } = ctx.params as { idOrSlug: string; id: string }
  await loadCommunityForModerator(currentUser, idOrSlug)

  const body = (await ctx.request.json('1mb')) as {
    status: 'approved' | 'rejected'
    reason?: string
  }
  validateRequestContract(ctx, 'PATCH:/api/v1/communities/:idOrSlug/applications/:id', {
    path: ctx.params,
    body,
  })

  if (body.status === 'approved') {
    await approveApplication(currentUser, id)
  } else {
    await rejectApplication(currentUser, id, body.reason)
  }

  ctx.setStatus(204)
})
