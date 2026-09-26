import app from '../../app.mts'
import { streamJsonObject, type Context } from '@jongleberry/api-server'
import {
  getOptionalAuthAndRateLimit,
  requireAuth,
  parseJsonBody,
  setAnonymousPublicCacheHeaders,
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
import type { FediverseIntegrationStatus } from '@services/fediverse-instances/integration-status'
import { currentUserCanModifyFediverseInstanceIntegrationStatus } from '@services/fediverse-instances/authorization'
import { indexById } from '@modules/utils'
import { HTTP_CACHE_SHORT_MAX_AGE_SECONDS } from '@voucha/config'
import { parseBooleanish } from '@ts-shared/utils/query'
import { clampAnonLimit } from '@modules/search-utils'
import { assertWithinContributionActionLimit } from '@services/contribution-gating/limits'
import { getUserActivePlan } from '@services/memberships'
import { parseTopicsSearchParams } from '@services/search-params'
import { sendHashtagTopicSearchErrorResponse } from '../hashtag-search-error-response.mts'
import { getBookmarksForEntities } from '@services/bookmarks/get'
import { getTopicElectionVotesByUser } from '@services/elections-votes/topic'
import { renderMarkdownBatch } from '@services/markdown/batch-render'
import { getAdminUserIdsFromEntities } from '@services/markdown/admin-users'
import { apiRequest, apiResponse } from '../../response-contract.mts'
import { classifyFediverseInstance as classifyInstance } from '@services/fediverse-search/adapters/instance-classification'
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

const INTEGRATION_STATUSES = ['pending', 'approved', 'blocked'] as const

type FediverseInstancesQuery = {
  q?: unknown
  sort?: unknown
  after?: unknown
  limit?: unknown
  software?: unknown
  open_registrations?: unknown
  integration_status?: unknown
}

type TopicBookmarks = Awaited<ReturnType<typeof getBookmarksForEntities>>
type TopicElectionVote = Awaited<ReturnType<typeof getTopicElectionVotesByUser>>[number]
type TopicElectionVotes = Record<string, TopicElectionVote>

function parseIntegrationStatus(value: unknown): FediverseIntegrationStatus | undefined {
  return typeof value === 'string' && (INTEGRATION_STATUSES as readonly string[]).includes(value)
    ? (value as FediverseIntegrationStatus)
    : undefined
}

app
  .route('/api/v1/fediverse/instances')
  .get(async (ctx: Context) => {
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
    const parsedSearchParams = await parseTopicsSearchParams(canonicalSearchQuery).catch(error =>
      sendHashtagTopicSearchErrorResponse(ctx, error),
    )
    if (!parsedSearchParams) return
    const { searchOptions } = parsedSearchParams
    searchOptions.omitLimit = false
    if (!currentUser) {
      searchOptions.limit = clampAnonLimit(searchOptions.limit)
    }
    const integrationStatus = parseIntegrationStatus(query.integration_status)
    Object.assign(searchOptions, {
      topic_types: ['fediverse_instance'],
      fediverse_instance: true,
      ...(query.software !== undefined && {
        fediverse_instance_software: String(query.software),
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

    const rawBody = await parseJsonBody<Record<string, unknown>>(ctx)
    ctx.assert(
      typeof rawBody.hostname === 'string' && rawBody.hostname.length > 0,
      422,
      'hostname must be a non-empty string',
    )
    const requestBody = { hostname: rawBody.hostname }
    const body = apiRequest('POST:/api/v1/fediverse/instances', requestBody)

    // ast-grep-ignore: no-three-sequential-awaits -- route handler validates auth/input before dependent mutation or response work
    const membershipPlan = await getUserActivePlan(currentUser.id)
    await assertWithinContributionActionLimit(currentUser, membershipPlan, 'fediverse_instance')

    const result = await createInstanceFromHostname(
      provenance,
      currentUser,
      body.hostname,
      classifyInstance,
    )

    ctx.setStatus(result.status === 'created' ? 201 : 200)
    ctx.json(result)
  })
