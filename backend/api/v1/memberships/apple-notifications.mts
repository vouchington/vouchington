import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import { getMembershipProviderContext } from '@voucha/config/membership-providers'
import {
  createAppleNotificationVerifier,
  ingestAppleAppStoreNotification,
  InvalidAppleNotificationError,
} from '@services/memberships/apple'
import { parseJsonBody } from '../../response-helpers.mts'

app.route('/api/v1/memberships/apple-app-store/notifications').post(async (ctx: Context) => {
  const evidence = await parseJsonBody<unknown>(ctx, '32kb')
  const context = getMembershipProviderContext('apple_app_store')
  try {
    const notification = await ingestAppleAppStoreNotification({
      evidence,
      environment: context.environment,
      applicationId: context.applicationId,
      verifier: createAppleNotificationVerifier(context),
    })
    ctx.setStatus(notification.replayed ? 200 : 202)
    ctx.json({ received: true })
  } catch (error) {
    if (error instanceof InvalidAppleNotificationError) {
      ctx.throw(400, error.message)
      return
    }
    throw error
  }
})
