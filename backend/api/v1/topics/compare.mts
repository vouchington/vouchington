import app from '../../app.mts'
import { streamJsonObject, type Context } from '@jongleberry/api-server'
import { HTTP_CACHE_LONG_MAX_AGE_SECONDS } from '@voucha/config'
import {
  getTopicByAnyCachedBatch,
  getTopicMetricsByAnyCachedBatch,
  getTopicElectionByIdCachedBatch,
} from '@services/entity-fetch'
import { getEntityRelations } from '@services/entity-relations/query'
import { getTopicDataPointInsights } from '@services/data-points/insights'
import { indexById } from '@modules/utils'
import { getBookmarksForEntities } from '@services/bookmarks/get'
import { getTopicElectionVotesByUser } from '@services/elections-votes/topic'
import { getOptionalAuthAndRateLimit } from '../../response-helpers.mts'

app.route('/api/v1/topics/compare').get(async (ctx: Context) => {
  const currentUser = await getOptionalAuthAndRateLimit(ctx, 'GET:/api/v1/topics/compare')

  const rawSlugs = ctx.query.slugs ? String(ctx.query.slugs) : ''
  if (!rawSlugs) {
    ctx.throw(400, 'Missing required query parameter: slugs')
  }

  const slugs = rawSlugs.split(',').flatMap(s => (s.trim() ? [s.trim()] : []))

  ctx.assert(slugs.length === 2, 400, 'slugs must contain exactly 2 values')
  ctx.assert(slugs[0] !== slugs[1], 400, 'slugs must be different')

  const topicResults = await getTopicByAnyCachedBatch(slugs)
  const topics = topicResults.filter(Boolean)

  if (topics.length < 2) {
    ctx.throw(404, 'One or more topics not found')
  }

  if (!currentUser) {
    ctx.set('Cache-Control', `public, max-age=${HTTP_CACHE_LONG_MAX_AGE_SECONDS}`)
  }

  const [topicA, topicB] = topics
  const topicIds = [topicA!.id, topicB!.id]

  const [topic_metrics, topic_elections, insightsA, insightsB, relationsA, relationsB] =
    await Promise.all([
      getTopicMetricsByAnyCachedBatch(topicIds).then(indexById),
      getTopicElectionByIdCachedBatch(topicIds).then(indexById),
      getTopicDataPointInsights(topicA!.id),
      getTopicDataPointInsights(topicB!.id),
      getEntityRelations('topic', topicA!.id, 'category', 'topic', {
        positiveNetVoteScore: true,
        limit: 20,
      }),
      getEntityRelations('topic', topicB!.id, 'category', 'topic', {
        positiveNetVoteScore: true,
        limit: 20,
      }),
    ])

  const categorySlugsA = extractCategorySlugs(relationsA)
  const categorySlugsB = extractCategorySlugs(relationsB)

  const output: Record<string, unknown> = {
    topics: indexById(topics),
    topic_metrics,
    topic_elections,
    topic_categories: { [topicA!.id]: categorySlugsA, [topicB!.id]: categorySlugsB },
    data_point_insights: { [topicA!.id]: insightsA, [topicB!.id]: insightsB },
  }

  if (currentUser) {
    output.bookmarks = getBookmarksForEntities(currentUser, 'topic', topicIds).then(b =>
      Object.keys(b).length > 0 ? b : undefined,
    )
    output.election_votes = getTopicElectionVotesByUser(currentUser.id, topicIds).then(votes => {
      if (votes.length === 0) return undefined
      return Object.fromEntries(votes.map(vote => [vote.entity_id, vote]))
    })
  }

  ctx.setType('json')
  await ctx.pipeline(streamJsonObject(output))
})

function extractCategorySlugs(relations: Awaited<ReturnType<typeof getEntityRelations>>): string[] {
  return relations.flatMap(relation => {
    const slug = relation.object_data?.['slug']
    return typeof slug === 'string' ? [slug] : []
  })
}
