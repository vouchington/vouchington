import { clampAnonLimit, getPaginationLimits } from '@services/pagination'
import app from '../../app.mts'
import { streamJsonObject, type Context } from '@jongleberry/api-server'
import {
  getOptionalAuthAndRateLimit,
  requireAuth,
  parseJsonBody,
  setAnonymousPublicCacheHeaders,
  validateRequestContract,
} from '../../response-helpers.mts'
import { assertNotSuspended } from '@services/users'
import { getTopicIds } from '@services/topics'
import { getTopicIdsCached } from '@services/entity-fetch/search-caches'
import {
  getTopicByAnyCachedBatch,
  getTopicMetricsByAnyCachedBatch,
  getTopicElectionByIdCachedBatch,
  getHostnameElectionByIdCachedBatch,
} from '@services/entity-fetch'
import {
  createInstanceFromHostname,
  getFediverseInstanceAttributesByIdBatch,
  type FediverseInstanceAttributes,
} from '@services/fediverse-instances'
import { currentUserCanModifyFediverseInstanceIntegrationStatus } from '@services/fediverse-instances/authorization'
import { indexById } from '@modules/utils'
import { HTTP_CACHE_SHORT_MAX_AGE_SECONDS } from '@voucha/config'
import { parseBooleanish } from '@ts-shared/utils/query'

import { assertWithinContributionActionLimit } from '@services/contribution-gating/limits'
import { getUserActivePlan } from '@services/memberships'
import { parseTopicsSearchParams, prepareTopicsSearchParams } from '@services/search-params'
import { getBookmarksForEntities } from '@services/bookmarks/get'
import { getTopicElectionVotesByUser } from '@services/elections-votes/topic'
import { renderMarkdownBatch } from '@services/markdown/batch-render'
import { getAdminUserIdsFromEntities } from '@services/markdown/admin-users'
import { apiQuery, apiResponse } from '../../response-contract.mts'
import { classifyFediverseInstance as classifyInstance } from '@services/fediverse-search/adapters/instance-classification'
import { stringFromUnknown } from '@ts-shared/utils/string-from-unknown'
import {
  fediverseInstancesQuery,
  parseIntegrationStatus,
  prepareFediverseInstanceQuery,
  type FediverseInstancesQuery,
} from './instances-query-helpers.mts'
import { getRequestContentProvenance } from '@modules/request-client-info/content-provenance'
type PublicFediverseInstanceAttributes = Omit<
  FediverseInstanceAttributes,
  'nodeinfo_raw' | 'integration_status'
>
function toPublicFediverseInstanceAttributes(
  attributes: FediverseInstanceAttributes | null,
): PublicFediverseInstanceAttributes | null {
  if (!attributes) return null
  return {
    software: attributes.software,
    protocol: attributes.protocol,
    nodeinfo_software_version: attributes.nodeinfo_software_version,
    total_users: attributes.total_users,
    monthly_active_users: attributes.monthly_active_users,
    open_registrations: attributes.open_registrations,
  }
}

type CreateFediverseInstanceRequest = { hostname: string }

type TopicBookmarks = Awaited<ReturnType<typeof getBookmarksForEntities>>
type TopicElectionVote = Awaited<ReturnType<typeof getTopicElectionVotesByUser>>[number]
type TopicElectionVotes = Record<string, TopicElectionVote>

app
  .route('/api/v1/fediverse/instances')
  .get(async (ctx: Context) => {
    apiQuery('GET:/api/v1/fediverse/instances', fediverseInstancesQuery)
    const currentUser = await getOptionalAuthAndRateLimit(ctx, 'GET:/api/v1/fediverse/instances')

    const query = ctx.query as FediverseInstancesQuery
    if (query.integration_status !== undefined) {
      ctx.assert(
        currentUserCanModifyFediverseInstanceIntegrationStatus(currentUser),
        403,
        'Forbidden',
      )
    }
    const canonicalSearchQuery = {
      ...(query.q !== undefined && { q: query.q }),
      ...(query.sort !== undefined && { sort: query.sort }),
      ...(query.after !== undefined && { after: query.after }),
      ...(query.limit !== undefined && { limit: query.limit }),
    }
    const integrationStatus = parseIntegrationStatus(query.integration_status)
    const preparedSearch = prepareTopicsSearchParams(canonicalSearchQuery, getPaginationLimits(25))
    const validationLimit = currentUser
      ? preparedSearch.paginationOptions.limit
      : clampAnonLimit(preparedSearch.paginationOptions.limit)
    validateRequestContract(ctx, 'GET:/api/v1/fediverse/instances', {
      query: prepareFediverseInstanceQuery(ctx.query, validationLimit, integrationStatus),
    })
    const parsedSearchParams = await parseTopicsSearchParams(
      canonicalSearchQuery,
      getPaginationLimits(25),
    )
    const { searchOptions } = parsedSearchParams
    searchOptions.omitLimit = false
    if (!currentUser) {
      searchOptions.limit = clampAnonLimit(searchOptions.limit)
    }
    Object.assign(searchOptions, {
      topic_types: ['fediverse_instance'],
      fediverse_instance: true,
      ...(query.software !== undefined && {
        fediverse_instance_software: stringFromUnknown(query.software),
      }),
      ...(query.open_registrations !== undefined && {
        fediverse_instance_open_registrations: parseBooleanish(query.open_registrations),
      }),
      ...(integrationStatus && { fediverse_instance_integration_status: integrationStatus }),
    })

    const result = currentUser
      ? await getTopicIds(searchOptions)
      : await getTopicIdsCached(searchOptions)
    const topicIds = result.results.map(r => r.id)

    setAnonymousPublicCacheHeaders(ctx, currentUser, HTTP_CACHE_SHORT_MAX_AGE_SECONDS)
    const topicsPromise = getTopicByAnyCachedBatch(topicIds)
    const topicsIndexedPromise = topicsPromise.then(indexById)
    const hostnameIdsPromise = topicsPromise.then(topics =>
      topics.flatMap(topic => (topic?.hostname?.id ? [topic.hostname.id] : [])),
    )
    const fediverseInstancesPromise = getFediverseInstanceAttributesByIdBatch(topicIds).then(rows =>
      Object.fromEntries(
        topicIds
          .map(
            (id, index) => [id, toPublicFediverseInstanceAttributes(rows[index] ?? null)] as const,
          )
          .filter((entry): entry is [string, NonNullable<(typeof entry)[1]>] => entry[1] != null),
      ),
    )
    const output = {
      results: topicsIndexedPromise.then(topicsMap =>
        result.results.filter(r => topicsMap[r.id] != null),
      ),
      page_info: result.page_info,
      topics: topicsIndexedPromise,
      topics_metrics: getTopicMetricsByAnyCachedBatch(topicIds).then(indexById),
      fediverse_instances: fediverseInstancesPromise,
      topic_elections: getTopicElectionByIdCachedBatch(topicIds).then(indexById),
      hostname_elections: hostnameIdsPromise.then(hostnameIds =>
        getHostnameElectionByIdCachedBatch(hostnameIds).then(indexById),
      ),
      markdown_to_html: topicsPromise.then(async topics => {
        const topicsMap = indexById(topics)
        const adminIds = await getAdminUserIdsFromEntities(topics)
        const entities = topicIds.flatMap(id => {
          const topic = topicsMap[id]
          return topic?.markdown
            ? [{ id, markdown: topic.markdown, created_by_id: topic.created_by?.id ?? '' }]
            : []
        })
        return renderMarkdownBatch(entities, adminIds)
      }),
      bookmarks: currentUser
        ? getBookmarksForEntities(currentUser, 'topic', topicIds)
        : Promise.resolve<TopicBookmarks>({}),
      election_votes:
        currentUser && topicIds.length > 0
          ? getTopicElectionVotesByUser(currentUser.id, topicIds).then(votes =>
              Object.fromEntries(votes.map(vote => [vote.entity_id, vote])),
            )
          : Promise.resolve<TopicElectionVotes>({}),
    }
    ctx.setType('json')
    await ctx.pipeline(streamJsonObject(apiResponse('GET:/api/v1/fediverse/instances', output)))
  })
  .post(async (ctx: Context) => {
    const currentUser = await requireAuth(ctx, 'POST:/api/v1/fediverse/instances')
    const provenance = getRequestContentProvenance()
    assertNotSuspended(currentUser)

    const body = await parseJsonBody<CreateFediverseInstanceRequest>(ctx)
    validateRequestContract(ctx, 'POST:/api/v1/fediverse/instances', { body })
    ctx.assert(body.hostname.length > 0, 422, 'hostname must be a non-empty string')

    // ast-grep-ignore: no-three-sequential-awaits -- route handler validates auth/input before dependent mutation or response work
    const membershipPlan = await getUserActivePlan(currentUser.id)
    await assertWithinContributionActionLimit(currentUser, membershipPlan, 'fediverse_instance')

    const result = await createInstanceFromHostname(
      currentUser,
      provenance,
      body.hostname,
      classifyInstance,
    )

    ctx.setStatus(result.status === 'created' ? 201 : 200)
    ctx.json(result)
  })
