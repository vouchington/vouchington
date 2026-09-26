import app from '../../app.mts'
import { streamJsonObject, type Context } from '@jongleberry/api-server'
import {
  getOptionalAuthAndRateLimit,
  requireAuth,
  validateRequestContract,
} from '../../response-helpers.mts'
import { getTopicIds, createTopic, type CreateTopicUpdates } from '@services/topics'
import { getTopicIdsCached } from '@services/entity-fetch/search-caches'
import {
  getTopicByAnyCachedBatch,
  getTopicMetricsByAnyCachedBatch,
  getTopicElectionByIdCachedBatch,
} from '@services/entity-fetch'
import { getBookmarksForEntities } from '@services/bookmarks/get'
import { indexById, isUUID } from '@modules/utils'
import { HTTP_CACHE_SHORT_MAX_AGE_SECONDS } from '@voucha/config'
import { renderMarkdownBatch } from '@services/markdown/batch-render'
import { getAdminUserIdsFromEntities } from '@services/markdown/admin-users'
import {
  parseTopicsSearchParams,
  prepareTopicsSearchParams,
  resolveTopicsSearchParams,
} from '@services/search-params'
import { clampAnonLimit } from '@modules/search-utils'
import { sendHashtagTopicSearchErrorResponse } from '../hashtag-search-error-response.mts'
import { getTopicElectionVotesByUser } from '@services/elections-votes/topic'
import { assertWithinContributionActionLimit } from '@services/contribution-gating/limits'
import { getUserActivePlan } from '@services/memberships'
import { currentUserCanCreateTopic } from '@services/topics/authorization'
import { assertNotSuspended } from '@services/users'
import { apiQuery } from '../../response-contract.mts'

app
  .route('/api/v1/topics')
  .get(async (ctx: Context) => {
    apiQuery('GET:/api/v1/topics', parseTopicsSearchParams)
    const currentUser = await getOptionalAuthAndRateLimit(ctx, 'GET:/api/v1/topics')
    const preparedSearchParams = prepareTopicsSearchParams(ctx.query)
    validateRequestContract(ctx, 'GET:/api/v1/topics', {
      query: preparedSearchParams.validationQuery,
    })

    const parsedSearchParams = await resolveTopicsSearchParams(preparedSearchParams).catch(error =>
      sendHashtagTopicSearchErrorResponse(ctx, error),
    )
    if (!parsedSearchParams) return
    const { shouldReturnEmpty, searchOptions } = parsedSearchParams
    if (!currentUser) {
      searchOptions.limit = clampAnonLimit(searchOptions.limit)
      searchOptions.omitLimit = false
    }

    if (shouldReturnEmpty) {
      if (!currentUser) {
        ctx.set('Cache-Control', `public, max-age=${HTTP_CACHE_SHORT_MAX_AGE_SECONDS}`)
      }

      const output: Record<string, unknown> = {
        results: [],
        page_info: {
          has_next_page: false,
          end_cursor: null,
          start_cursor: null,
        },
        topics: {},
        topics_metrics: {},
        topic_elections: {},
        markdown_to_html: {},
      }

      ctx.setType('json')
      await ctx.pipeline(streamJsonObject(output))
      return
    }

    const result = currentUser
      ? await getTopicIds(searchOptions)
      : await getTopicIdsCached(searchOptions)
    const topicIds = result.results.map((r: { id: string }) => r.id)

    // Only cache for logged-out users
    if (!currentUser) {
      ctx.set('Cache-Control', `public, max-age=${HTTP_CACHE_SHORT_MAX_AGE_SECONDS}`)
    }

    // Use streaming pattern: pass promises directly to allow independent streaming
    const topicsPromise = getTopicByAnyCachedBatch(topicIds)
    const topicsIndexedPromise = topicsPromise.then(indexById)
    const topicMetricsIndexedPromise = getTopicMetricsByAnyCachedBatch(topicIds).then(indexById)
    const visibleResultsPromise = Promise.all([
      topicsIndexedPromise,
      topicMetricsIndexedPromise,
    ]).then(([topicsMap, topicMetricsMap]) =>
      result.results.filter(r => topicsMap[r.id] != null && topicMetricsMap[r.id] != null),
    )
    const output: Record<string, unknown> = {
      // Filter results to only include IDs present in the sidecar maps — a topic may
      // have been soft-deleted between the search query and the batch entity fetch,
      // which would leave an orphaned ID in results with missing sidecar entries.
      // Sidecars below intentionally key off the unfiltered topicIds, matching
      // `topics`/`topics_metrics` — extra entries for a since-deleted topic are
      // harmless since clients look up sidecars by ID and ignore extras.
      results: visibleResultsPromise,
      page_info: result.page_info,
      topics: topicsIndexedPromise,
      topics_metrics: topicMetricsIndexedPromise,
      topic_elections: getTopicElectionByIdCachedBatch(topicIds).then(indexById),
      markdown_to_html: topicsPromise.then(async topics => {
        const topicsMap = indexById(topics)
        const adminIds = await getAdminUserIdsFromEntities(topics)
        const entities = topicIds.flatMap(id => {
          const markdown = topicsMap[id]?.markdown ?? ''
          return markdown
            ? [{ id, markdown, created_by_id: topicsMap[id]?.created_by?.id ?? '' }]
            : []
        })

        return await renderMarkdownBatch(entities, adminIds)
      }),
    }

    if (currentUser) {
      output.bookmarks = getBookmarksForEntities(currentUser, 'topic', topicIds)
      output.election_votes =
        topicIds.length === 0
          ? Promise.resolve({})
          : getTopicElectionVotesByUser(currentUser.id, topicIds).then(votes =>
              Object.fromEntries(votes.map(v => [v.entity_id, v])),
            )
    }

    ctx.setType('json')
    await ctx.pipeline(streamJsonObject(output))
  })
  .post(async (ctx: Context) => {
    const currentUser = await requireAuth(ctx, 'POST:/api/v1/topics')
    ctx.assert(currentUserCanCreateTopic(currentUser), 403, 'Forbidden')
    assertNotSuspended(currentUser)

    const body = (await ctx.request.json('1mb')) as CreateTopicUpdates
    validateRequestContract(ctx, 'POST:/api/v1/topics', { body })
    ctx.assert(
      body.source_topic_alias_id === undefined || isUUID(body.source_topic_alias_id),
      422,
      'Invalid source_topic_alias_id',
    )
    ctx.assert(
      body.topic_type !== 'rss_feed',
      422,
      'Source topics can only be created by ingesting a URL',
    )
    ctx.assert(
      body.topic_type !== 'fediverse_instance',
      422,
      'Instance topics can only be created by suggesting a hostname',
    )
    // ast-grep-ignore: no-three-sequential-awaits -- route handler validates auth/input before dependent mutation or response work
    const membershipPlan = await getUserActivePlan(currentUser.id)
    await assertWithinContributionActionLimit(currentUser, membershipPlan, 'topic')
    const topic = await createTopic(currentUser, body)

    ctx.setStatus(201)
    ctx.json({ topic })
  })
