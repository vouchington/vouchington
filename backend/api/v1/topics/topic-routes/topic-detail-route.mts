import { streamJsonObject, type Context } from '@jongleberry/api-server'
// Side-effect import: registers the image-exists guard consulted when updateTopic
// receives logo_image_id/hero_image_id changes (topics cannot depend on images).
import '@services/images/register-image-exists-guard'
import { getBookmarksForEntities } from '@services/bookmarks/get'
import { getTopicElectionVotesByUser } from '@services/elections-votes/topic'
import {
  getTopicByAnyWithRedirectCached,
  getTopicElectionByIdCachedBatch,
  getTopicMetricsByAnyCached,
} from '@services/entity-fetch'
import { getEntityRelations } from '@services/entity-relations/query'
import renderMarkdown from '@services/markdown'
import { getLatestTopicContentUpdate } from '@services/topic-revisions'
import {
  getTopicByAny,
  getTopicChildren,
  getTopicMetricsByAny,
  getTopicParents,
  getTopicViewerCounts,
  updateTopic,
  type CreateTopicUpdates,
} from '@services/topics'
import { assertNotSuspended, entityRelationViewerFor } from '@services/users'
import { HTTP_CACHE_LONG_MAX_AGE_SECONDS } from '@voucha/config'
import app from '../../../app.mts'
import {
  getOptionalAuthAndRateLimit,
  setAnonymousPublicCacheHeaders,
  requireAuth,
  validateRequestContract,
} from '../../../response-helpers.mts'
import { currentUserCanUpdateTopic } from '@services/topics/authorization'

function hasTopicCountMetrics(
  topicMetrics: unknown,
): topicMetrics is Awaited<ReturnType<typeof getTopicMetricsByAny>> {
  if (!topicMetrics || typeof topicMetrics !== 'object') {
    return false
  }

  const count = (topicMetrics as { count?: unknown }).count
  return !!count && typeof count === 'object'
}

app
  .route('/api/v1/topics/:idOrSlug')
  .get(async (ctx: Context) => {
    const currentUser = await getOptionalAuthAndRateLimit(ctx, 'GET:/api/v1/topics/:idOrSlug')
    validateRequestContract(ctx, 'GET:/api/v1/topics/:idOrSlug', { path: ctx.params })
    const topicResult = await getTopicByAnyWithRedirectCached(ctx.params.idOrSlug!)
    if (!topicResult) ctx.throw(404, 'Topic not found')
    const { topic, topic_redirect } = topicResult

    setAnonymousPublicCacheHeaders(ctx, currentUser, HTTP_CACHE_LONG_MAX_AGE_SECONDS)

    const html = topic.markdown ? await renderMarkdown(topic.markdown) : ''
    const topicMetricsPromise = getTopicMetricsByAnyCached(topic.id).then(topicMetrics => {
      if (hasTopicCountMetrics(topicMetrics)) return topicMetrics
      return getTopicMetricsByAny(topic.id)
    })
    const output: Record<string, unknown> = {
      topic,
      topic_redirect,
      html,
      topic_election: getTopicElectionByIdCachedBatch([topic.id]).then(
        elections => elections[0] ?? null,
      ),
      topic_metrics: Promise.all([
        topicMetricsPromise,
        currentUser ? getTopicViewerCounts(currentUser, topic.id) : Promise.resolve(undefined),
      ]).then(([topicMetrics, viewerCount]) => {
        if (!topicMetrics) return undefined
        if (!viewerCount) return topicMetrics

        return {
          ...topicMetrics,
          viewer_count: viewerCount,
        }
      }),
      topic_categories: getEntityRelations('topic', topic.id, 'category', 'topic', {
        viewer: entityRelationViewerFor(currentUser),
        positiveNetVoteScore: true,
        limit: 20,
      }).then(relations =>
        relations.flatMap(relation => {
          const slug = relation.object_data?.['slug']
          return typeof slug === 'string' ? [slug] : []
        }),
      ),
      topic_parents: getTopicParents(topic.id),
      topic_children: getTopicChildren(topic.id),
      topic_content_update: getLatestTopicContentUpdate(topic.id),
    }
    if (currentUser) {
      output.bookmarks = getBookmarksForEntities(currentUser, 'topic', [topic.id]).then(b =>
        Object.keys(b).length > 0 ? b : undefined,
      )
      output.election_vote = getTopicElectionVotesByUser(currentUser.id, [topic.id]).then(
        votes => votes[0] ?? null,
      )
    }
    ctx.setType('json')
    await ctx.pipeline(streamJsonObject(output))
  })
  .patch(async (ctx: Context) => {
    const currentUser = await requireAuth(ctx, 'PATCH:/api/v1/topics/:idOrSlug')
    ctx.assert(currentUserCanUpdateTopic(currentUser), 403, 'Forbidden')
    assertNotSuspended(currentUser)
    validateRequestContract(ctx, 'PATCH:/api/v1/topics/:idOrSlug', { path: ctx.params })

    const topic = await getTopicByAny(ctx.params.idOrSlug!)
    if (!topic) ctx.throw(404, 'Topic not found')

    const changes = (await ctx.request.json('1mb')) as Partial<CreateTopicUpdates>
    validateRequestContract(ctx, 'PATCH:/api/v1/topics/:idOrSlug', { body: changes })
    const updated = await updateTopic(currentUser, topic, changes)

    ctx.json({ topic: updated })
  })
  .delete((ctx: Context) => {
    ctx.set('Allow', 'GET, PATCH')
    ctx.throw(405, 'Topic deletion is intentionally unsupported. Merge topics instead.')
  })
