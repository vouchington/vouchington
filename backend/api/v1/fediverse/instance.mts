import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import {
  getOptionalAuthAndRateLimit,
  requireAuthAndRateLimit,
  parseJsonBody,
  validateUUIDParam,
  setAnonymousPublicCacheHeaders,
} from '../../response-helpers.mts'
import {
  getTopicByAnyCached,
  getTopicElectionByIdCachedBatch,
  getHostnameElectionByIdCachedBatch,
} from '@services/entity-fetch'
import {
  getFediverseInstanceAttributes,
  setIntegrationStatusAsAdmin,
  type FediverseInstanceAttributes,
} from '@services/fediverse-instances'
import { currentUserCanModifyFediverseInstanceIntegrationStatus } from '@services/fediverse-instances/authorization'
import { assertNotSuspended } from '@services/users'
import { HTTP_CACHE_LONG_MAX_AGE_SECONDS } from '@voucha/config'
import { apiRequest } from '../../response-contract.mts'

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

type FediverseIntegrationChangeRequest = {
  integration_status: 'pending' | 'approved' | 'blocked'
  reason?: string | null
}

app.route('/api/v1/fediverse/instances/:id').get(async (ctx: Context) => {
  const currentUser = await getOptionalAuthAndRateLimit(ctx, 'GET:/api/v1/fediverse/instances/:id')
  const topic = await getTopicByAnyCached(ctx.params.id!)
  ctx.assert(
    topic && topic.topic_type === 'fediverse_instance',
    404,
    'Fediverse instance not found',
  )

  setAnonymousPublicCacheHeaders(ctx, currentUser, HTTP_CACHE_LONG_MAX_AGE_SECONDS)

  const [fediverseInstance, topicElections, hostnameElections] = await Promise.all([
    getFediverseInstanceAttributes(topic.id),
    getTopicElectionByIdCachedBatch([topic.id]),
    topic.hostname?.id
      ? getHostnameElectionByIdCachedBatch([topic.hostname.id])
      : Promise.resolve([]),
  ])

  ctx.json({
    topic,
    fediverse_instance: toPublicFediverseInstanceAttributes(fediverseInstance),
    topic_election: topicElections[0] ?? null,
    hostname_election: hostnameElections[0] ?? null,
  })
})

app.route('/api/v1/fediverse/instances/:id/integration-changes').post(async (ctx: Context) => {
  const currentUser = await requireAuthAndRateLimit(
    ctx,
    currentUserCanModifyFediverseInstanceIntegrationStatus,
    'POST:/api/v1/fediverse/instances/:id/integration-changes',
  )
  assertNotSuspended(currentUser)
  const topicId = validateUUIDParam(ctx, 'id')

  const topic = await getTopicByAnyCached(topicId)
  ctx.assert(
    topic && topic.topic_type === 'fediverse_instance',
    404,
    'Fediverse instance not found',
  )

  const rawBody = await parseJsonBody<Record<string, unknown>>(ctx)
  const integrationStatus = rawBody.integration_status
  ctx.assert(
    integrationStatus === 'pending' ||
      integrationStatus === 'approved' ||
      integrationStatus === 'blocked',
    422,
    'integration_status must be one of: pending, approved, blocked',
  )
  ctx.assert(
    rawBody.reason === undefined || rawBody.reason === null || typeof rawBody.reason === 'string',
    422,
    'reason must be a string',
  )
  const requestBody: FediverseIntegrationChangeRequest = {
    integration_status: integrationStatus,
    ...(rawBody.reason !== undefined && { reason: rawBody.reason }),
  }
  const body = apiRequest('POST:/api/v1/fediverse/instances/:id/integration-changes', requestBody)

  const status = await setIntegrationStatusAsAdmin(currentUser, {
    topicId,
    integrationStatus: body.integration_status,
    reason: body.reason,
  })

  ctx.json({ status, topic_id: topicId, integration_status: integrationStatus })
})
