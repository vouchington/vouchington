import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import { getMembershipProviderContext } from '@voucha/config/membership-providers'
import {
  createAppleNotificationVerifier,
  ingestAppleAppStoreNotification,
  InvalidAppleNotificationError,
} from '@services/memberships/apple'
import { parseJsonBody, validateRequestContract } from '../../response-helpers.mts'

// Specialized ingress (server-to-server webhook): Apple signs the payload as a JWS. Its
// signature and shape (400 on failure) are verified before the open JSON carrier contract
// is recorded and anything is persisted.
app.route('/api/v1/memberships/apple-app-store/notifications').post(async (ctx: Context) => {
  const evidence = await parseJsonBody(ctx, '32kb')
  const context = getMembershipProviderContext('apple_app_store')
  try {
    const notification = await ingestAppleAppStoreNotification({
      evidence,
      environment: context.environment,
      applicationId: context.applicationId,
      onVerified: () =>
        validateRequestContract(ctx, 'POST:/api/v1/memberships/apple-app-store/notifications', {
          body: evidence,
        }),
      verifier: createAppleNotificationVerifier(context),
    })
    ctx.setStatus(notification.replayed ? 200 : 202)
    ctx.json({ received: true })
  } catch (err) {
    if (err instanceof InvalidAppleNotificationError) {
      ctx.throw(400, err.message)
      return
    }
    throw err
  }
})
