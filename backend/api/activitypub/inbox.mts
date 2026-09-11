import app from '../app.mts'
import type { Context } from '@jongleberry/api-server'
import onError from '@modules/on-error'
import { getOrFetchRemoteActorByKeyId, getRemoteActorByKeyId } from '@services/remote-actors'
import { isFediverseInstanceApprovedByHostname } from '@services/fediverse-instances'
import { extractSignatureKeyId, verifyDigest, verifySignature } from '@modules/http-signatures'
import { getExpectedHost } from '@modules/api-utils'
import {
  activityPubInboxDeliveryTransitions,
  isAsyncActivityPubInboxDeliveryEnabled,
  parseInboundActivity,
  recordAndDispatchInboundActivity,
} from '@services/ap-inbox-activities'
import { enqueueActivityPubInboxDelivery } from '@queues/activitypub-inbox/enqueues'
import {
  rejectActivityPubInboxCapacity,
  rejectRateLimitedActivityPubDelivery,
} from './inbox-capacity-response.mts'
import {
  getActivityPubInboxAttemptWindowSeconds,
  getActivityPubInboxWindowSeconds,
  isActivityPubInboxSenderRateLimited,
  recordActivityPubInboxAttempt,
  recordActivityPubInboxSenderDelivery,
} from '@services/route-rate-limits'

// Inbound ActivityPub deliveries are per-request signature-authenticated (HTTP Signatures over
// the sender's actor keypair), not session-authenticated — there is no Voucha session on a
// server-to-server delivery, so this route intentionally skips response-helpers.mts's
// session-auth preamble (requireAuth / getOptionalAuthAndRateLimit / requireAuthAndRateLimit).
app.route('/ap/inbox').post(async (ctx: Context) => {
  const signatureHeader = headerValue(ctx.req.headers.signature)
  const digestHeader = headerValue(ctx.req.headers.digest)
  const dateHeader = headerValue(ctx.req.headers.date)
  // Behind the Cloudflare Worker, the raw Host header is BACKEND_ORIGIN (buildOriginRequest
  // rewrites it) while the public host remote servers actually signed travels in
  // x-forwarded-host. getExpectedHost() only trusts that header when the shared worker secret
  // validates, so it falls back to the raw Host for direct/local-dev traffic.
  const hostHeader = getExpectedHost(ctx.req.headers) || undefined
  ctx.assert(
    signatureHeader && digestHeader && dateHeader && hostHeader,
    401,
    'Missing signature headers',
  )

  const keyId = extractSignatureKeyId(signatureHeader)
  ctx.assert(keyId, 401, 'Missing keyId in Signature header')

  const senderHostname = parseHostname(keyId)
  ctx.assert(senderHostname, 401, 'Invalid keyId')

  ctx.assert(ctx.ip, 400, 'Missing source IP')
  if (await recordActivityPubInboxAttempt(ctx.ip)) {
    rejectRateLimitedActivityPubDelivery(ctx, getActivityPubInboxAttemptWindowSeconds())
    return
  }

  // Server allowlist gate runs before the (network) remote-actor fetch below, so a request from a
  // non-approved instance never reaches the SSRF-guarded fetch at all.
  const isApproved = await isFediverseInstanceApprovedByHostname(senderHostname)
  ctx.assert(isApproved, 403, 'Instance not approved')

  if (await isActivityPubInboxSenderRateLimited(senderHostname)) {
    rejectRateLimitedActivityPubDelivery(ctx, getActivityPubInboxWindowSeconds())
    return
  }

  const rawBody = await ctx.request.buffer('1mb')
  ctx.assert(verifyDigest(rawBody, digestHeader), 401, 'Digest verification failed')
  const contentTypeHeader = headerValue(ctx.req.headers['content-type'])

  if (isAsyncActivityPubInboxDeliveryEnabled()) {
    ctx.assert(
      /headers="[^"]+"/.test(signatureHeader) && /signature="[^"]+"/.test(signatureHeader),
      401,
      'Invalid signature header format',
    )
    ctx.assert(!Number.isNaN(new Date(dateHeader).getTime()), 401, 'Invalid date header')
    const activity = parseInboundActivity(rawBody)
    // Local cache only: the API process has no IPv4 egress, so unknown actors stay unverified
    // until the I/O worker fetches. A cached actor is a self-contained DB read, so invalid
    // signatures are rejected before they become durable rows.
    const cachedActor = await getRemoteActorByKeyId(keyId)
    let verifiedRemoteActorId: string | undefined
    if (cachedActor) {
      const verification = verifySignature(
        ctx.req.method ?? 'POST',
        ctx.req.url ?? '/ap/inbox',
        hostHeader,
        rawBody,
        signatureHeader,
        digestHeader,
        dateHeader,
        cachedActor.public_key_pem,
        contentTypeHeader
          ? { additionalHeaders: { 'content-type': contentTypeHeader } }
          : undefined,
      )
      ctx.assert(verification.valid, 401, verification.error ?? 'Invalid signature')
      ctx.assert(
        activity.actor === cachedActor.actor_uri,
        401,
        'Signing actor does not match activity actor',
      )
      if (await recordActivityPubInboxSenderDelivery(senderHostname)) {
        rejectRateLimitedActivityPubDelivery(ctx, getActivityPubInboxWindowSeconds())
        return
      }
      verifiedRemoteActorId = cachedActor.id
    }
    const accepted = await activityPubInboxDeliveryTransitions.accept(
      {
        requestMethod: ctx.req.method ?? 'POST',
        requestTarget: ctx.req.url ?? '/ap/inbox',
        expectedHost: hostHeader,
        signatureHeader,
        digestHeader,
        dateHeader,
        contentTypeHeader,
        rawBody,
        claimedActivityId: activity.id,
        claimedActivityType: activity.type,
        claimedActorUri: activity.actor,
        senderHostname,
      },
      verifiedRemoteActorId,
    )
    if (accepted.outcome === 'capacity-exceeded') {
      rejectActivityPubInboxCapacity(ctx, accepted.value)
      return
    }
    const delivery = accepted.value
    try {
      await enqueueActivityPubInboxDelivery(delivery)
      await activityPubInboxDeliveryTransitions.acknowledgeEnqueue(
        delivery.deliveryId,
        delivery.processingAttemptId,
      )
    } catch (error) {
      onError(error instanceof Error ? error : new Error(String(error)))
    }
    ctx.setStatus(202)
    ctx.json({ received: true })
    return
  }

  const remoteActor = await getOrFetchRemoteActorByKeyId(keyId)

  // Some senders (e.g. Mastodon) additionally sign `content-type`; verifySignature() only
  // accepts headers it already knows how to reconstruct, so this must be threaded through
  // `additionalHeaders` or those senders fail with "Unknown signed header: content-type".
  const verification = verifySignature(
    ctx.req.method ?? 'POST',
    ctx.req.url ?? '/ap/inbox',
    hostHeader,
    rawBody,
    signatureHeader,
    digestHeader,
    dateHeader,
    remoteActor.public_key_pem,
    contentTypeHeader ? { additionalHeaders: { 'content-type': contentTypeHeader } } : undefined,
  )
  ctx.assert(verification.valid, 401, verification.error ?? 'Invalid signature')

  if (await recordActivityPubInboxSenderDelivery(senderHostname)) {
    rejectRateLimitedActivityPubDelivery(ctx, getActivityPubInboxWindowSeconds())
    return
  }

  const activity = parseInboundActivity(rawBody)
  // Distinct from the keyId <-> fetched-document match already enforced inside
  // getOrFetchRemoteActorByKeyId: this checks the *activity's own* claimed actor against the
  // actor that actually signed the request, rejecting a signer that forges another actor's id.
  ctx.assert(
    activity.actor === remoteActor.actor_uri,
    401,
    'Signing actor does not match activity actor',
  )

  const { duplicate } = await recordAndDispatchInboundActivity(remoteActor, activity)
  if (duplicate) {
    ctx.json({ received: true, duplicate: true })
    return
  }

  ctx.setStatus(202)
  ctx.json({ received: true })
})

function headerValue(header: string | string[] | undefined): string | undefined {
  return Array.isArray(header) ? header[0] : header
}

function parseHostname(uri: string): string | undefined {
  try {
    return new URL(uri).hostname
  } catch {
    return undefined
  }
}
