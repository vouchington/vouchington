import app from '../../app.mts'
import { enqueueDeleteNotification } from '@queues/notifications/enqueues'
import type { Context } from '@jongleberry/api-server'
import { createPaginationParser } from '@modules/pagination'
import { requireAuth, validateRequestContract } from '../../response-helpers.mts'
import { apiQuery } from '../../response-contract.mts'
import {
  hasNotification,
  getUnreadNotificationsSummary,
  listNotifications,
  listWebPushSubscriptionsPage,
  markAllNotificationsRead,
  markNotificationReadAndGetRedirectTarget,
  markNotificationRead,
  upsertWebPushSubscription,
  deleteWebPushSubscription,
} from '@services/notifications'

type CreateWebPushSubscriptionRequest = {
  endpoint: string
  p256dh: string
  auth: string
  expiration_time_ms?: number | null
  user_agent?: string
}

const notificationsParser = createPaginationParser({
  cursor: { type: 'simple' },
  limit: { min: 1, max: 100, default: 25 },
})
const pushSubscriptionsParser = createPaginationParser({
  cursor: { type: 'simple' },
  limit: { min: 1, max: 100, default: 25 },
})

function parseEndpointUrl(endpoint: string): URL | null {
  try {
    return new URL(endpoint)
  } catch {
    return null
  }
}

app.route('/api/v1/my/notifications').get(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'GET:/api/v1/my/notifications')

  const options = notificationsParser.parse(ctx.query)
  ctx.json(await listNotifications(currentUser.id, options))
})

app.route('/api/v1/my/notifications/unread').get(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'GET:/api/v1/my/notifications/unread')

  ctx.json(await getUnreadNotificationsSummary(currentUser.id))
})

app.route('/api/v1/my/notifications/:id/redirect-target').get(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'GET:/api/v1/my/notifications/:id/redirect-target')
  validateRequestContract(ctx, 'GET:/api/v1/my/notifications/:id/redirect-target', {
    path: ctx.params,
  })

  const target_url = await markNotificationReadAndGetRedirectTarget(currentUser.id, ctx.params.id!)
  ctx.assert(target_url, 404, 'Notification not found')
  ctx.json({ target_url })
})

app.route('/api/v1/my/notifications/read-all').post(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'POST:/api/v1/my/notifications/read-all')

  await markAllNotificationsRead(currentUser.id)
  ctx.setStatus(204)
})

app
  .route('/api/v1/my/notifications/:id')
  .patch(async (ctx: Context) => {
    const currentUser = await requireAuth(ctx, 'PATCH:/api/v1/my/notifications/:id')
    validateRequestContract(ctx, 'PATCH:/api/v1/my/notifications/:id', { path: ctx.params })

    const updated = await markNotificationRead(currentUser.id, ctx.params.id!)
    ctx.assert(updated, 404, 'Notification not found')
    ctx.setStatus(204)
  })
  .delete(async (ctx: Context) => {
    const currentUser = await requireAuth(ctx, 'DELETE:/api/v1/my/notifications/:id')
    validateRequestContract(ctx, 'DELETE:/api/v1/my/notifications/:id', { path: ctx.params })

    const exists = await hasNotification(currentUser.id, ctx.params.id!)
    ctx.assert(exists, 404, 'Notification not found')
    await enqueueDeleteNotification(currentUser.id, ctx.params.id!)
    ctx.setStatus(204)
  })

// The query carrier is not schema-validated: the pagination parser owns limit clamping and
// malformed-cursor 400s, and the generated schema has no unknown-parameter or coercion rules.
app.route('/api/v1/my/notifications/push-subscriptions').get(async (ctx: Context) => {
  apiQuery('GET:/api/v1/my/notifications/push-subscriptions', pushSubscriptionsParser)
  const currentUser = await requireAuth(ctx, 'GET:/api/v1/my/notifications/push-subscriptions')

  ctx.json(
    await listWebPushSubscriptionsPage(currentUser.id, pushSubscriptionsParser.parse(ctx.query)),
  )
})

app.route('/api/v1/my/notifications/push-subscriptions').post(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'POST:/api/v1/my/notifications/push-subscriptions')

  const body = (await ctx.request.json('20kb')) as CreateWebPushSubscriptionRequest
  validateRequestContract(ctx, 'POST:/api/v1/my/notifications/push-subscriptions', { body })
  // The schema fixes types; length, scheme and integer bounds are semantic checks.
  const endpoint = parseEndpointUrl(body.endpoint)
  ctx.assert(
    endpoint?.protocol === 'https:' && endpoint.host.length > 0,
    400,
    'endpoint must be a valid HTTPS URL',
  )
  ctx.assert(
    body.p256dh.length >= 16 && body.p256dh.length <= 512,
    400,
    'p256dh must be between 16 and 512 characters',
  )
  ctx.assert(
    body.auth.length >= 8 && body.auth.length <= 512,
    400,
    'auth must be between 8 and 512 characters',
  )
  const expirationTimeMs = body.expiration_time_ms ?? null
  ctx.assert(
    expirationTimeMs === null || (Number.isInteger(expirationTimeMs) && expirationTimeMs >= 0),
    422,
    'expiration_time_ms must be a non-negative integer or null',
  )

  const subscription = await upsertWebPushSubscription({
    userId: currentUser.id,
    endpoint: endpoint.href,
    p256dh: body.p256dh,
    auth: body.auth,
    expirationTimeMs,
    userAgent: body.user_agent ?? '',
  })

  ctx.setStatus(201)
  ctx.json({ web_push_subscription: subscription })
})

app.route('/api/v1/my/notifications/push-subscriptions/:id').delete(async (ctx: Context) => {
  const currentUser = await requireAuth(
    ctx,
    'DELETE:/api/v1/my/notifications/push-subscriptions/:id',
  )
  validateRequestContract(ctx, 'DELETE:/api/v1/my/notifications/push-subscriptions/:id', {
    path: ctx.params,
  })

  await deleteWebPushSubscription(currentUser.id, ctx.params.id!)
  ctx.setStatus(204)
})
