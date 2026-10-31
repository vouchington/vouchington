import app from '../app.mts'
import type { Context } from '@jongleberry/api-server'
import { getRemoteActorByKeyId, isRemoteActorFresh } from '@services/remote-actors'
import {
  getRemoteActorsWorkLimit,
  remoteActorsWorkMaxValues,
} from '@services/remote-actors/work-limits'
import {
  DNS_TIMEOUT_MS,
  FETCH_TIMEOUT_MS,
} from '@services/remote-actors/fetch-remote-actor-document'
import {
  releaseActivityPubInboxDelivery,
  reserveActivityPubInboxDelivery,
} from '@data-stores/valkey-glide-mq/activitypub-inbox-reservations'
import { BACKGROUND_QUEUE_NAME } from '@queues/background/config'
import { background } from '@queues/background/queues'
import onError from '@modules/on-error'
import { isFediverseInstanceApprovedByHostname } from '@services/fediverse-instances'
import { extractSignatureKeyId, verifyDigest, verifySignature } from '@modules/http-signatures'
import { getExpectedHost } from '@modules/api-utils'
import {
  ACTIVITYPUB_INBOX_MAX_RAW_BODY_BYTES,
  createActivityPubInboxDeliveryJob,
  parseInboundActivity,
} from '@services/ap-inbox-activities'
import {
  createActivityPubInboxDeliveryJobId,
  enqueueActivityPubInboxDelivery,
  getActivityPubInboxDeliveryTtlMs,
} from '@queues/activitypub/enqueues/inbox'
import { ACTIVITYPUB_INBOX_LIMITS } from '@services/route-rate-limits/config'
import {
  getActivityPubInboxAttemptWindowSeconds,
  getActivityPubInboxWindowSeconds,
  isActivityPubInboxSenderRateLimited,
  recordActivityPubInboxAttempt,
  recordActivityPubInboxSenderDelivery,
} from '@services/route-rate-limits'

// Server-to-server deliveries use HTTP Signatures, so this route skips session authentication.
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

  const rawBody = await ctx.request.buffer(ACTIVITYPUB_INBOX_MAX_RAW_BODY_BYTES)
  ctx.assert(verifyDigest(rawBody, digestHeader), 401, 'Digest verification failed')
  const contentTypeHeader = headerValue(ctx.req.headers['content-type'])

  ctx.assert(rawBody.length <= ACTIVITYPUB_INBOX_MAX_RAW_BODY_BYTES, 413, 'Payload Too Large')
  ctx.assert(
    /headers="[^"]+"/.test(signatureHeader) && /signature="[^"]+"/.test(signatureHeader),
    401,
    'Invalid signature header format',
  )
  ctx.assert(!Number.isNaN(new Date(dateHeader).getTime()), 401, 'Invalid date header')
  const activity = parseInboundActivity(rawBody)
  // Only fresh cached keys can be verified before admission. Stale or unknown actors are
  // fetched by the I/O worker so rotated keys are checked against the current actor document.
  const cachedActor = await getRemoteActorByKeyId(keyId)
  let verifiedRemoteActorId: string | undefined
  if (cachedActor && isRemoteActorFresh(cachedActor)) {
    const verification = verifySignature(
      ctx.req.method ?? 'POST',
      ctx.req.url ?? '/ap/inbox',
      hostHeader,
      rawBody,
      signatureHeader,
      digestHeader,
      dateHeader,
      cachedActor.public_key_pem,
      contentTypeHeader ? { additionalHeaders: { 'content-type': contentTypeHeader } } : undefined,
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
  const delivery = createActivityPubInboxDeliveryJob(
    {
      requestMethod: ctx.req.method ?? 'POST',
      requestTarget: ctx.req.url ?? '/ap/inbox',
      expectedHost: hostHeader,
      signatureHeader,
      digestHeader,
      dateHeader,
      contentTypeHeader,
      rawBody,
      senderHostname,
    },
    verifiedRemoteActorId,
    new Date(),
    verifiedRemoteActorId !== undefined,
  )
  const jobId = createActivityPubInboxDeliveryJobId(delivery.requestDigest)
  const ttlMs = getActivityPubInboxDeliveryTtlMs(
    ACTIVITYPUB_INBOX_LIMITS.windowSeconds.max * 1000,
    DNS_TIMEOUT_MS,
    FETCH_TIMEOUT_MS,
  )
  let reserved: boolean
  try {
    reserved = await reserveActivityPubInboxDelivery(
      BACKGROUND_QUEUE_NAME,
      jobId,
      getRemoteActorsWorkLimit('inbound_backlog_cap'),
      ttlMs,
      remoteActorsWorkMaxValues.inbound_backlog_cap,
    )
  } catch (err) {
    onError(err instanceof Error ? err : new Error(String(err)))
    rejectBackedUpActivityPubDelivery(ctx)
    return
  }
  if (!reserved) {
    rejectBackedUpActivityPubDelivery(ctx)
    return
  }
  try {
    const queued = await enqueueActivityPubInboxDelivery(delivery, jobId)
    if (queued === null) await releaseActivityPubInboxDelivery(BACKGROUND_QUEUE_NAME, jobId)
  } catch (err) {
    // An ambiguous enqueue failure may have persisted the job. Keep its reservation until
    // terminal release (or TTL) if the queue read also fails.
    try {
      if (!(await background.getJob(jobId)))
        await releaseActivityPubInboxDelivery(BACKGROUND_QUEUE_NAME, jobId)
    } catch (err_) {
      onError(err_ instanceof Error ? err_ : new Error(String(err_)))
    }
    throw err
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

function rejectRateLimitedActivityPubDelivery(ctx: Context, retryAfterSeconds: number): never {
  ctx.set('Retry-After', String(retryAfterSeconds))
  ctx.throw(429, 'Too Many Requests')
}

function rejectBackedUpActivityPubDelivery(ctx: Context): never {
  ctx.set('Retry-After', '60')
  ctx.throw(503, 'Inbox temporarily unavailable')
}
