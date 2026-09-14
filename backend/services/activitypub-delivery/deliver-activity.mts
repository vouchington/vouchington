import { validateUrl, UnsafeUrlError } from 'ssrf-guard/node'
import onError from '@modules/on-error'
import {
  getExternalRequestDispatcher,
  getPinnedRequestDispatcher,
} from '@modules/utils/http-dispatchers'
import { handleHttpErrors } from '@modules/utils/http'
import { buildSignatureHeaders, withSignatureHeaders } from '@modules/http-signatures'
import createHttpError from 'http-errors'
import undici from 'undici'
import type { OutboundActivityJson } from './types.mts'

const DELIVERY_TIMEOUT_MS = 10000
// ssrf-guard@1.0.0's validateUrl short-circuits to no timeout when both `signal` and `timeoutMs`
// are undefined (mirrors crawl-url/safety.mts:9-12's DEFAULT_DNS_TIMEOUT_MS), so this option is
// mandatory, not a tuning knob.
const DNS_TIMEOUT_MS = 5000
const ACTIVITY_CONTENT_TYPE = 'application/activity+json'

export type DeliverActivityToInboxInput = {
  inboxUrl: string
  activity: OutboundActivityJson
  keyId: string
  privateKeyPem: string
}

export type DeliverActivityToInboxDeps = {
  validateUrl: typeof validateUrl
  fetch: typeof undici.fetch
}

const defaultDeps: DeliverActivityToInboxDeps = { validateUrl, fetch: undici.fetch }

function cancelResponseBody(response: Response): void {
  const cancellation = response.body?.cancel()
  if (cancellation) {
    // Cancellation is best-effort cleanup; preserve the HTTP error outcome.
    void cancellation.catch(onError)
  }
}

// Delivers a signed AS2 activity to a remote inbox (Phase C4). SSRF-guarded exactly like
// @services/remote-actors/fetch-remote-actor-document.mts: the inbox hostname is resolved and
// validated before any request, and the connection is pinned to the validated addresses (no
// TOCTOU window between check and fetch). Signed with HTTP Signatures (Cavage-12, RSA-SHA256) via
// @modules/http-signatures — callers must decrypt the sending user's actor private key immediately
// before this call and let it go out of scope immediately after, per that module's README contract.
//
// @modules/utils/http's fetchWithTimeout is GET-only, so delivery hand-rolls its own POST-with-body
// fetch rather than extending a shared GET-only helper — same dispatcher/timeout/redirect pattern.
// `redirect: 'manual'` is load-bearing SSRF protection: silently following a redirect would
// deliver to a target host that was never validated.
/* no-mistakes: integration=activitypub */
export async function deliverActivityToInbox(
  input: DeliverActivityToInboxInput,
  deps: DeliverActivityToInboxDeps = defaultDeps,
): Promise<void> {
  let resolvedAddresses
  try {
    resolvedAddresses = await deps.validateUrl(input.inboxUrl, { timeoutMs: DNS_TIMEOUT_MS })
  } catch (error) {
    if (error instanceof UnsafeUrlError) {
      throw createHttpError(422, `Unsafe delivery inbox URL: ${error.reason}`)
    }
    // A DNS/SSRF resolution timeout must stay status-less so the worker's wrapHttpForRetry
    // (processors.mts) keeps this delivery job retryable rather than treating it as a permanent
    // failure — mirrors the same contract for a non-2xx delivery response below.
    throw error
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

  const abortController = new AbortController()
  const timeoutId = setTimeout(() => abortController.abort(), DELIVERY_TIMEOUT_MS)
  const dispatcher = resolvedAddresses.length
    ? getPinnedRequestDispatcher(resolvedAddresses)
    : getExternalRequestDispatcher()

  let response: Response
  try {
    response = await deps.fetch(input.inboxUrl, {
      method: 'POST',
      dispatcher,
      headers,
      body,
      signal: abortController.signal,
      redirect: 'manual',
    })
  } finally {
    clearTimeout(timeoutId)
  }

  // Throws typed, retry-classified errors for 429/5xx (matches @modules/queue-errors's
  // wrapHttpForRetry semantics, which the worker processor wraps this call with).
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
