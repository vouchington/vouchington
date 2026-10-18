import app from '../../app.mts'
import { streamJsonObject, type Context } from '@jongleberry/api-server'
import { HTTP_CACHE_LONG_MAX_AGE_SECONDS } from '@voucha/config'
import {
  getTopicByAnyCachedBatch,
  getTopicMetricsByAnyCachedBatch,
  getTopicElectionByIdCachedBatch,
} from '@services/entity-fetch'
import { attachTopicProvenance } from '@services/content-provenance'
import {
  getEntityRelationsBatch,
  type EntityRelationResult,
} from '@services/entity-relations/query'
import { getTopicDataPointInsightsBatch } from '@services/data-points/insights'
import { indexById } from '@modules/utils'
import { getBookmarksForEntities } from '@services/bookmarks/get'
import { getTopicElectionVotesByUser } from '@services/elections-votes/topic'
import { getOptionalAuthAndRateLimit, validateRequestContract } from '../../response-helpers.mts'
import { entityRelationViewerFor } from '@services/users'
import { defineQueryContract, queryCsvArray, queryString } from '@vouchington/pagination'
import { apiQuery } from '../../response-contract.mts'
import { prepareQueryForValidation } from '@services/search-params/prepare-query'

const compareTopicsQueryContract = defineQueryContract({ slugs: queryCsvArray(queryString()) })

app.route('/api/v1/topics/compare').get(async (ctx: Context) => {
  apiQuery('GET:/api/v1/topics/compare', compareTopicsQueryContract)
  const currentUser = await getOptionalAuthAndRateLimit(ctx, 'GET:/api/v1/topics/compare')
  validateRequestContract(ctx, 'GET:/api/v1/topics/compare', {
    query: prepareQueryForValidation(ctx.query, compareTopicsQueryContract.queryContract),
  })

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
  const viewer = entityRelationViewerFor(currentUser)
  const topicIds = [topicA!.id, topicB!.id]

  const [labeledTopics, topic_metrics, topic_elections, insights, relations] = await Promise.all([
    attachTopicProvenance(topics, currentUser),
    getTopicMetricsByAnyCachedBatch(topicIds).then(indexById),
    getTopicElectionByIdCachedBatch(topicIds).then(indexById),
    getTopicDataPointInsightsBatch(topicIds),
    getEntityRelationsBatch('topic', topicIds, 'category', 'topic', {
      viewer,
      positiveNetVoteScore: true,
      limit: 20,
    }),
  ])

  const categorySlugsA = extractCategorySlugs(relations.get(topicA!.id) ?? [])
  const categorySlugsB = extractCategorySlugs(relations.get(topicB!.id) ?? [])

  const output: Record<string, unknown> = {
    topics: indexById(labeledTopics),
    topic_metrics,
    topic_elections,
    topic_categories: { [topicA!.id]: categorySlugsA, [topicB!.id]: categorySlugsB },
    data_point_insights: {
      [topicA!.id]: insights.get(topicA!.id),
      [topicB!.id]: insights.get(topicB!.id),
    },
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

function extractCategorySlugs(relations: EntityRelationResult[]): string[] {
  return relations.flatMap(relation => {
    const slug = relation.object_data?.['slug']
    return typeof slug === 'string' ? [slug] : []
  })
}
