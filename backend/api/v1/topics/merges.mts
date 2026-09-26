import type { Context } from '@jongleberry/api-server'
import {
  currentUserCanMergeTopic,
  getTopicByAnyWithRedirect,
  mergeTopicAliases,
} from '@services/topics'
import app from '../../app.mts'
import { requireAuthAndRateLimit, validateRequestContract } from '../../response-helpers.mts'

type MergeTopicBody = { destination_id_or_slug: string }

app.route('/api/v1/topics/:sourceIdOrSlug/merges').post(async (ctx: Context) => {
  const currentUser = await requireAuthAndRateLimit(
    ctx,
    currentUserCanMergeTopic,
    'POST:/api/v1/topics/:sourceIdOrSlug/merges',
  )
  validateRequestContract(ctx, 'POST:/api/v1/topics/:sourceIdOrSlug/merges', { path: ctx.params })

  const body = (await ctx.request.json('1mb')) as MergeTopicBody
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

  const sourceResult = await getTopicByAnyWithRedirect(ctx.params.sourceIdOrSlug!)
  ctx.assert(sourceResult, 404, 'Source topic not found')
  const source = sourceResult
  ctx.assert(!source.topic_redirect, 409, 'Source topic has already been merged')

  const destinationResult = await getTopicByAnyWithRedirect(destination)
  ctx.assert(destinationResult, 404, 'Destination topic not found')
  const target = destinationResult
  ctx.assert(!target.topic_redirect, 409, 'Destination topic has already been merged')

  const merge = await mergeTopicAliases(currentUser, source.topic, target.topic)
  ctx.setStatus(201)
  ctx.json({
    topic: merge.destination_topic,
    topic_merge: {
      source_topic_id: merge.source_topic_id,
      destination_topic_id: merge.destination_topic_id,
      moved_aliases: merge.moved_aliases,
    },
  })
})
