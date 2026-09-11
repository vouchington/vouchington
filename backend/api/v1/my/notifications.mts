import app from '../../app.mts'
import { enqueueDeleteNotification } from '@queues/notifications/enqueues'
import type { Context } from '@jongleberry/api-server'
import { createPaginationParser } from '@modules/pagination'
import { requireAuth } from '../../response-helpers.mts'
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

const notificationsParser = createPaginationParser({
  cursor: { type: 'simple' },
  limit: { min: 1, max: 100, default: 25 },
})
const pushSubscriptionsParser = createPaginationParser({
  cursor: { type: 'simple' },
  limit: { min: 1, max: 100, default: 25 },
})

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
  ctx.assert(ctx.params.id, 400, 'id is required')

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
    ctx.assert(ctx.params.id, 400, 'id is required')

    const updated = await markNotificationRead(currentUser.id, ctx.params.id!)
    ctx.assert(updated, 404, 'Notification not found')
    ctx.setStatus(204)
  })
  .delete(async (ctx: Context) => {
    const currentUser = await requireAuth(ctx, 'DELETE:/api/v1/my/notifications/:id')
    ctx.assert(ctx.params.id, 400, 'id is required')

    const exists = await hasNotification(currentUser.id, ctx.params.id!)
    ctx.assert(exists, 404, 'Notification not found')
    await enqueueDeleteNotification(currentUser.id, ctx.params.id!)
    ctx.setStatus(204)
  })

app.route('/api/v1/my/notifications/push-subscriptions').get(async (ctx: Context) => {
  apiQuery('GET:/api/v1/my/notifications/push-subscriptions', pushSubscriptionsParser)
  const currentUser = await requireAuth(ctx, 'GET:/api/v1/my/notifications/push-subscriptions')

  ctx.json(
    await listWebPushSubscriptionsPage(currentUser.id, pushSubscriptionsParser.parse(ctx.query)),
  )
})

app.route('/api/v1/my/notifications/push-subscriptions').post(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'POST:/api/v1/my/notifications/push-subscriptions')

  const body = (await ctx.request.json('20kb')) as Record<string, unknown>
  const endpoint =
    typeof body.endpoint === 'string'
      ? (() => {
          try {
            return new URL(body.endpoint)
          } catch {
            return null
          }
        })()
      : null
  ctx.assert(
    endpoint?.protocol === 'https:' && endpoint.host.length > 0,
    400,
    'endpoint must be a valid HTTPS URL',
  )
  ctx.assert(
    typeof body.p256dh === 'string' && body.p256dh.length >= 16 && body.p256dh.length <= 512,
    400,
    'p256dh must be between 16 and 512 characters',
  )
  ctx.assert(
    typeof body.auth === 'string' && body.auth.length >= 8 && body.auth.length <= 512,
    400,
    'auth must be between 8 and 512 characters',
  )
  ctx.assert(
    body.expiration_time_ms === null ||
      body.expiration_time_ms === undefined ||
      (typeof body.expiration_time_ms === 'number' &&
        Number.isFinite(body.expiration_time_ms) &&
        Number.isInteger(body.expiration_time_ms) &&
        body.expiration_time_ms >= 0),
    422,
    'expiration_time_ms must be a non-negative integer or null',
  )
  ctx.assert(
    body.user_agent === undefined || typeof body.user_agent === 'string',
    422,
    'user_agent must be a string',
  )

  const subscription = await upsertWebPushSubscription({
    userId: currentUser.id,
    endpoint: endpoint.href,
    p256dh: body.p256dh,
    auth: body.auth,
    expirationTimeMs: (body.expiration_time_ms as number | null | undefined) ?? null,
    userAgent: (body.user_agent as string | undefined) ?? '',
  })

  ctx.setStatus(201)
  ctx.json({ web_push_subscription: subscription })
})

app.route('/api/v1/my/notifications/push-subscriptions/:id').delete(async (ctx: Context) => {
  const currentUser = await requireAuth(
    ctx,
    'DELETE:/api/v1/my/notifications/push-subscriptions/:id',
  )
  ctx.assert(ctx.params.id, 400, 'id is required')

  await deleteWebPushSubscription(currentUser.id, ctx.params.id!)
  ctx.setStatus(204)
})
