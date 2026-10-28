import { isSlug, isUUID } from '@modules/utils'
import type { Context } from '@jongleberry/api-server'
import {
  currentUserCanMergeTopic,
  getTopicByAnyWithRedirect,
  getTopicsByAnyWithRedirectBatch,
  createTopicMergeOperation,
  getTopicMergeOperation,
} from '@services/topics'
import app from '../../app.mts'
import {
  parseJsonBody,
  requireAuthAndRateLimit,
  validateRequestContract,
  validateUUIDParam,
} from '../../response-helpers.mts'

type MergeTopicBody = { destination_id_or_slug: string }

app.route('/api/v1/topics/:sourceIdOrSlug/merges').post(async (ctx: Context) => {
  const currentUser = await requireAuthAndRateLimit(
    ctx,
    currentUserCanMergeTopic,
    'POST:/api/v1/topics/:sourceIdOrSlug/merges',
  )
  validateRequestContract(ctx, 'POST:/api/v1/topics/:sourceIdOrSlug/merges', { path: ctx.params })

  const body = (await parseJsonBody(ctx, '1mb')) as MergeTopicBody
  validateRequestContract(ctx, 'POST:/api/v1/topics/:sourceIdOrSlug/merges', {
    body,
  })
  const destinationIdOrSlug = body.destination_id_or_slug
  ctx.assert(
    typeof destinationIdOrSlug === 'string' && destinationIdOrSlug.trim(),
    400,
    'destination_id_or_slug is required',
  )
  const destination = destinationIdOrSlug

  // Keep source 404/409 ahead of a malformed destination while batching ordinary inputs.
  const validDestination = isUUID(destination.trim()) || isSlug(destination.trim().toLowerCase())
  const batch = await getTopicsByAnyWithRedirectBatch([
    ctx.params.sourceIdOrSlug!,
    ...(validDestination ? [destination] : []),
  ])
  const sourceResult = batch[0]
  ctx.assert(sourceResult, 404, 'Source topic not found')
  const source = sourceResult
  ctx.assert(!source.topic_redirect, 409, 'Source topic has already been merged')

  const destinationResult = validDestination
    ? batch[1]
    : await getTopicByAnyWithRedirect(destination)
  ctx.assert(destinationResult, 404, 'Destination topic not found')
  const target = destinationResult
  ctx.assert(!target.topic_redirect, 409, 'Destination topic has already been merged')

  const operation = await createTopicMergeOperation(currentUser, source.topic, target.topic)
  ctx.setStatus(202)
  ctx.json({
    topic_merge: {
      ...operation,
      status_url: `/api/v1/topics/${operation.source_topic_id}/merges/${operation.id}`,
    },
  })
})

app.route('/api/v1/topics/:sourceIdOrSlug/merges/:operationId').get(async (ctx: Context) => {
  const currentUser = await requireAuthAndRateLimit(
    ctx,
    currentUserCanMergeTopic,
    'GET:/api/v1/topics/:sourceIdOrSlug/merges/:operationId',
  )
  validateRequestContract(ctx, 'GET:/api/v1/topics/:sourceIdOrSlug/merges/:operationId', {
    path: ctx.params,
  })
  const operationId = validateUUIDParam(ctx, 'operationId')
  const source = await getTopicByAnyWithRedirect(ctx.params.sourceIdOrSlug!)
  ctx.assert(source, 404, 'Source topic not found')
  const sourceId = source.topic_redirect?.source_topic_id ?? source.topic.id
  const operation = await getTopicMergeOperation(currentUser, sourceId, operationId)
  ctx.assert(operation, 404, 'Topic merge operation not found')
  ctx.json({
    topic_merge: {
      ...operation,
      status_url: `/api/v1/topics/${operation.source_topic_id}/merges/${operation.id}`,
    },
  })
})
