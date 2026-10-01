import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import { getMembershipProviderContext } from '@voucha/config/membership-providers'
import { enqueueProcessGooglePlayNotification } from '@queues/memberships/enqueues'
import {
  getCachedGoogleOidcTrustMaterial,
  googleOidcValkeyTrustStore,
  ingestGooglePlayRtdnPush,
  InvalidGooglePlayRtdnError,
  GooglePlayRtdnTrustUnavailableError,
} from '@services/memberships/google'

type GooglePubSubPushEnvelope = {
  message?: { messageId?: string; data?: string }
}

// Specialized ingress (server-to-server webhook): a Pub/Sub push authenticated by an OIDC bearer.
// The shared JSON contract adapter is intentionally absent; the envelope is re-serialized as the raw
// body that `ingestGooglePlayRtdnPush` verifies (401 on failure) before anything is enqueued.
app.route('/api/v1/memberships/google-play/notifications').post(async (ctx: Context) => {
  const audience = process.env.GOOGLE_PLAY_PUBSUB_AUDIENCE?.trim()
  const serviceAccountEmail = process.env.GOOGLE_PLAY_PUBSUB_SERVICE_ACCOUNT_EMAIL?.trim()
  if (!audience || !serviceAccountEmail)
    ctx.throw(503, 'Google Play notification authentication is not configured')
  const trust = await getCachedGoogleOidcTrustMaterial({
    store: googleOidcValkeyTrustStore,
    issuer: 'https://accounts.google.com',
    audience,
    serviceAccountEmail,
  })
  if (!trust) ctx.throw(503, 'Google Play notification signing keys are unavailable')
  let envelope: GooglePubSubPushEnvelope
  try {
    envelope = await ctx.request.json<GooglePubSubPushEnvelope>('32kb')
  } catch {
    ctx.throw(401, 'Invalid Google Play notification.')
    return
  }
  const rawBody = Buffer.from(JSON.stringify(envelope))
  const context = getMembershipProviderContext('google_play')
  try {
    const notification = await ingestGooglePlayRtdnPush({
      rawBody,
      authorization:
        typeof ctx.req.headers.authorization === 'string'
          ? ctx.req.headers.authorization
          : undefined,
      environment: context.environment,
      applicationId: context.applicationId,
      trust,
      enqueue: async data => {
        await enqueueProcessGooglePlayNotification(data)
      },
    })
    ctx.setStatus(notification.replayed ? 200 : 202)
    ctx.json({ received: true })
  } catch (error) {
    if (error instanceof GooglePlayRtdnTrustUnavailableError) {
      ctx.throw(503, error.message)
      return
    }
    if (error instanceof InvalidGooglePlayRtdnError) {
      ctx.throw(401, error.message)
      return
    }
    throw error
  }
})
