import { validateUrl, UnsafeUrlError } from 'ssrf-guard/node'
import { cancelResponseBody, fetchWithTimeout, handleHttpErrors } from '@modules/utils/http'
import { buildSignatureHeaders, withSignatureHeaders } from '@modules/http-signatures'
import createHttpError from 'http-errors'
import type { OutboundActivityJson } from './types.mts'

const DELIVERY_TIMEOUT_MS = 10000
// ssrf-guard@1.0.0's validateUrl short-circuits to no timeout when both `signal` and `timeoutMs`
// are undefined (mirrors crawl-url/safety.mts:9-12's DEFAULT_DNS_TIMEOUT_MS), so this option is
// mandatory, not a tuning knob.
const DNS_TIMEOUT_MS = 5000
const ACTIVITY_CONTENT_TYPE = 'application/activity+json'

type DeliverActivityToInboxInput = {
  inboxUrl: string
  activity: OutboundActivityJson
  keyId: string
  privateKeyPem: string
}

// Delivers a signed AS2 activity to a remote inbox (Phase C4). SSRF-guarded exactly like
// @services/remote-actors/fetch-remote-actor-document.mts: the inbox hostname is resolved and
// validated before any request, and the connection is pinned to the validated addresses (no
// TOCTOU window between check and fetch). Signed with HTTP Signatures (Cavage-12, RSA-SHA256) via
// @modules/http-signatures — callers must decrypt the sending user's actor private key immediately
// before this call and let it go out of scope immediately after, per that module's README contract.
//
// `fetchWithTimeout` enforces `redirect: 'manual'` as load-bearing SSRF protection: silently
// following a redirect would deliver to a target host that was never validated.
/* no-mistakes: integration=activitypub */
export async function deliverActivityToInbox(input: DeliverActivityToInboxInput): Promise<void> {
  let resolvedAddresses
  try {
    resolvedAddresses = await validateUrl(input.inboxUrl, { timeoutMs: DNS_TIMEOUT_MS })
  } catch (err) {
    if (err instanceof UnsafeUrlError) {
      throw createHttpError(422, `Unsafe delivery inbox URL: ${err.reason}`)
    }
    // A DNS/SSRF resolution timeout must stay status-less so the worker's wrapHttpForRetry
    // (processors.mts) keeps this delivery job retryable rather than treating it as a permanent
    // failure — mirrors the same contract for a non-2xx delivery response below.
    throw err
  }

  const body = JSON.stringify(input.activity)
  const signatureHeaders = buildSignatureHeaders(
    'POST',
    input.inboxUrl,
    body,
    input.keyId,
    input.privateKeyPem,
  )
  const headers = withSignatureHeaders(
    { 'Content-Type': ACTIVITY_CONTENT_TYPE, Accept: ACTIVITY_CONTENT_TYPE },
    signatureHeaders,
  )

  const { response } = await fetchWithTimeout({
    url: input.inboxUrl,
    method: 'POST',
    headers,
    body,
    requestTimeoutMs: DELIVERY_TIMEOUT_MS,
    responseTimeoutMs: DELIVERY_TIMEOUT_MS,
    resolvedAddresses,
  })

  // Throws typed, retry-classified errors for 429/5xx (matches @modules/queue-errors's
  // wrapHttpForRetry semantics, which the worker processor wraps this call with). A 429 carries the
  // remote's `Retry-After` as `retryAfterMs`, which wrapHttpForRetry turns into a delayed requeue.
  handleHttpErrors({ response, url: input.inboxUrl })
  if (!response.ok) {
    cancelResponseBody(response)
    throw createHttpError(
      response.status,
      `Activity delivery to ${input.inboxUrl} failed with status ${response.status}`,
    )
  }
  cancelResponseBody(response)
}
