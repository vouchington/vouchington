import app from '../../app.mts'
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
  type AutomodFeedbackAction,
  type AutomodFeedbackOutcome,
  type RecentAutomodActionSourceType,
} from '@services/moderation-training'

app.route('/api/v1/communities/:idOrSlug/automod/recent-actions').get(async (ctx: Context) => {
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

  const { actions, hasNextPage, endCursor, stats } = await searchRecentAutomodActions(
    community.id,
    {
      windowHours: parseWindowHours(ctx.query.window),
      limit: parseLimit(ctx.query.limit),
      after: typeof ctx.query.after === 'string' ? ctx.query.after : null,
      sourceType: parseSourceType(ctx.query.source),
      agentSlug: typeof ctx.query.agent === 'string' ? ctx.query.agent : null,
      postType: parsePostType(ctx.query.post_type ?? ctx.query.content_type),
      maxConfidence: parseMaxConfidence(ctx.query.max_confidence),
    },
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

function parseWindowHours(value: unknown): number {
  if (value === '24h') return 24
  if (value === '7d') return 24 * 7
  return 48
}

function parseLimit(value: unknown): number {
  if (value === undefined) return 25
  const limit = Number(value)
  return Number.isFinite(limit) && limit > 0 ? Math.min(Math.floor(limit), 100) : 25
}

function parseMaxConfidence(value: unknown): number | null {
  if (value === undefined || value === null || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function parseSourceType(value: unknown): RecentAutomodActionSourceType | null {
  return typeof value === 'string' && isRecentAutomodActionSourceType(value) ? value : null
}

function parsePostType(value: unknown): string | null {
  return typeof value === 'string' && isRecentAutomodPostType(value) ? value : null
}

function isRecentAutomodActionSourceType(value: string): value is RecentAutomodActionSourceType {
  return (
    value === 'agent_moderation' ||
    value === 'openai_omni' ||
    value === 'spam_detection' ||
    value === 'community_prompt'
  )
}

function isRecentAutomodPostType(value: string) {
  return (
    value === 'discussion' ||
    value === 'review' ||
    value === 'data_point' ||
    value === 'story' ||
    value === 'topic_recommendation' ||
    value === 'comment' ||
    value === 'article' ||
    value === 'blog_post'
  )
}

function isAutomodFeedbackOutcome(value: unknown): value is AutomodFeedbackOutcome {
  return value === 'false_positive' || value === 'true_positive'
}

function isAutomodFeedbackAction(value: unknown): value is AutomodFeedbackAction {
  return value === 'reinstate' || value === 'keep_removed' || value === 'label_only'
}
