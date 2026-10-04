import app from '../../app.mts'
import { apiQuery } from '../../response-contract.mts'
import type { Context } from '@jongleberry/api-server'
import { parseJsonBody, requireAuth, validateRequestContract } from '../../response-helpers.mts'
import {
  currentUserCanModerateCommunity,
  getCommunityMember,
  getCommunityOrThrow,
} from '@services/communities'
import {
  recordAutomodActionFeedback,
  searchRecentAutomodActions,
} from '@services/moderation-training'
import { communityAutomodActionsQuery } from './query-contracts-helpers.mts'
import {
  isAutomodFeedbackAction,
  isAutomodFeedbackOutcome,
  parseLimit,
  parseMaxConfidence,
  parsePostType,
  parseSourceType,
  parseWindowHours,
} from './automod-recent-actions-helpers.mts'

app.route('/api/v1/communities/:idOrSlug/automod/recent-actions').get(async (ctx: Context) => {
  apiQuery('GET:/api/v1/communities/:idOrSlug/automod/recent-actions', communityAutomodActionsQuery)
  const currentUser = await requireAuth(
    ctx,
    'GET:/api/v1/communities/:idOrSlug/automod/recent-actions',
  )
  const { idOrSlug } = ctx.params as { idOrSlug: string }
  const community = await getCommunityOrThrow(idOrSlug)
  const membership = await getCommunityMember(community.id, currentUser.id)

  ctx.assert(currentUserCanModerateCommunity(currentUser, community, membership), 403, 'Forbidden')
  validateRequestContract(ctx, 'GET:/api/v1/communities/:idOrSlug/automod/recent-actions', {
    path: ctx.params,
  })

  const options = {
    windowHours: parseWindowHours(ctx.query.window),
    limit: parseLimit(ctx.query.limit),
    after: typeof ctx.query.after === 'string' ? ctx.query.after : null,
    sourceType: parseSourceType(ctx.query.source),
    agentSlug: typeof ctx.query.agent === 'string' ? ctx.query.agent : null,
    postType: parsePostType(ctx.query.post_type ?? ctx.query.content_type),
    maxConfidence: parseMaxConfidence(ctx.query.max_confidence),
  }
  const query: Record<string, unknown> = {}
  if (ctx.query.window !== undefined)
    query.window = options.windowHours === 24 ? '24h' : options.windowHours === 168 ? '7d' : '48h'
  if (ctx.query.limit !== undefined) query.limit = options.limit
  if (options.after !== null) query.after = options.after
  if (options.sourceType !== null) query.source = options.sourceType
  if (options.agentSlug !== null) query.agent = options.agentSlug
  if (options.postType !== null)
    query[ctx.query.post_type === undefined ? 'content_type' : 'post_type'] = options.postType
  if (options.maxConfidence !== null) query.max_confidence = options.maxConfidence
  validateRequestContract(ctx, 'GET:/api/v1/communities/:idOrSlug/automod/recent-actions', {
    query,
  })
  const { actions, hasNextPage, endCursor, stats } = await searchRecentAutomodActions(
    community.id,
    options,
  )

  ctx.json({
    automod_actions: actions,
    stats,
    page_info: {
      has_next_page: hasNextPage,
      end_cursor: endCursor,
    },
  })
})

app
  .route('/api/v1/communities/:idOrSlug/automod/recent-actions/:sourceKey/feedback')
  .post(async (ctx: Context) => {
    const currentUser = await requireAuth(
      ctx,
      'POST:/api/v1/communities/:idOrSlug/automod/recent-actions/:sourceKey/feedback',
    )
    const { idOrSlug, sourceKey } = ctx.params as { idOrSlug: string; sourceKey: string }
    const community = await getCommunityOrThrow(idOrSlug)
    const membership = await getCommunityMember(community.id, currentUser.id)

    ctx.assert(!community.archived_at, 403, 'Community is archived')
    ctx.assert(
      currentUserCanModerateCommunity(currentUser, community, membership),
      403,
      'Forbidden',
    )

    const body = await parseJsonBody<{
      outcome?: unknown
      action?: unknown
      reason_code?: unknown
      note?: unknown
    }>(ctx)
    validateRequestContract(
      ctx,
      'POST:/api/v1/communities/:idOrSlug/automod/recent-actions/:sourceKey/feedback',
      { path: ctx.params, body },
    )
    ctx.assert(isAutomodFeedbackOutcome(body.outcome), 422, 'Invalid outcome')
    ctx.assert(isAutomodFeedbackAction(body.action), 422, 'Invalid action')
    ctx.assert(
      body.reason_code === undefined ||
        body.reason_code === null ||
        typeof body.reason_code === 'string',
      422,
      'Invalid reason_code',
    )
    ctx.assert(
      body.note === undefined || body.note === null || typeof body.note === 'string',
      422,
      'Invalid note',
    )

    const feedback = await recordAutomodActionFeedback({
      communityId: community.id,
      sourceKey,
      actorUserId: currentUser.id,
      outcome: body.outcome,
      action: body.action,
      reasonCode: body.reason_code ?? null,
      note: body.note ?? null,
    })

    ctx.setStatus(201)
    ctx.json({ feedback, applied_action: feedback.applied_action })
  })
