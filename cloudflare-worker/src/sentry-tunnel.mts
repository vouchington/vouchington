// Sentry tunnel endpoint — proxies browser Sentry envelopes through the CF Worker
// to bypass ad-blockers and ensure delivery reliability. The tunnel validates the
// DSN host and project ID from each envelope before forwarding.
//
// References:
//   https://docs.sentry.io/platforms/javascript/troubleshooting/#using-the-tunnel-option

import { edgeErrorResponse, withFailureNoStoreHeaders } from './error-response.mts'
import { getSentryEnvelopeDiagnostics } from './sentry-envelope-diagnostics.mts'
import {
  logSentryTunnelForwardFailure,
  logSentryTunnelRejection,
  logSentryTunnelUpstreamResponse,
  type SentryTunnelRejectReason,
} from './sentry-tunnel-diagnostics.mts'

// Allowlisted Sentry ingest host and project IDs. Update when rotating DSNs.
// - 4507688156856320: web/frontend project (browser events routed through tunnel to bypass ad-blockers)
// - 4511154639077376: cloudflare-worker project (worker events routed through tunnel)
// The backend project (4507721302736896) must send directly to Sentry. Allowing it here would make
// backend error reporting depend on the Worker route whose origin is the backend, creating a
// circular failure path. The project-ID rejection test structurally protects this boundary.
const SENTRY_HOST = 'o4507688154824704.ingest.us.sentry.io'
const SENTRY_PROJECT_IDS = new Set(['4507688156856320', '4511154639077376'])

// 1 MB cap — typical Sentry envelopes are a few KB; large payloads indicate
// abuse or a misconfigured SDK. Checked via Content-Length before buffering.
const MAX_ENVELOPE_BYTES = 1_000_000

type ReadEnvelopeResult =
  | { kind: 'ok'; envelope: string }
  | { kind: 'too-large' }
  | { kind: 'read-error' }

type SentryTunnelDiagnosticDetails = {
  limitBytes?: number
}

function sentryTunnelErrorResponse(
  request: Request,
  status: number,
  message: string,
  code: string,
  reason: SentryTunnelRejectReason,
  details?: SentryTunnelDiagnosticDetails,
): Response {
  logSentryTunnelRejection(request, status, reason, details)
  return edgeErrorResponse(status, message, code)
}

async function readEnvelopeWithLimit(request: Request): Promise<ReadEnvelopeResult> {
  if (!request.body) {
    return { kind: 'ok', envelope: '' }
  }

  try {
    const reader = request.body.getReader()
    const decoder = new TextDecoder()
    const chunks: string[] = []
    let bytesRead = 0

    while (true) {
      // eslint-disable-next-line no-await-in-loop -- each read advances one reader and decoder stream while applying body backpressure
      const { done, value } = await reader.read()
      if (done) {
        chunks.push(decoder.decode())
        return { kind: 'ok', envelope: chunks.join('') }
      }

      bytesRead += value.byteLength
      if (bytesRead > MAX_ENVELOPE_BYTES) {
        reader.cancel().catch(() => {})
        return { kind: 'too-large' }
      }

      chunks.push(decoder.decode(value, { stream: true }))
    }
  } catch {
    return { kind: 'read-error' }
  }
}

export async function handleSentryTunnel(request: Request): Promise<Response> {
  const contentLength = request.headers.get('content-length')
  if (contentLength !== null && Number(contentLength) > MAX_ENVELOPE_BYTES) {
    return sentryTunnelErrorResponse(
      request,
      413,
      'Payload Too Large',
      'INVALID_INPUT',
      'content_length_too_large',
      { limitBytes: MAX_ENVELOPE_BYTES },
    )
  }

  const readEnvelope = await readEnvelopeWithLimit(request)
  if (readEnvelope.kind === 'too-large') {
    return sentryTunnelErrorResponse(
      request,
      413,
      'Payload Too Large',
      'INVALID_INPUT',
      'body_too_large',
      { limitBytes: MAX_ENVELOPE_BYTES },
    )
  }
  if (readEnvelope.kind === 'read-error') {
    return sentryTunnelErrorResponse(
      request,
      400,
      'Bad Request',
      'INVALID_INPUT',
      'body_read_error',
    )
  }
  const { envelope } = readEnvelope

  // The first line of a Sentry envelope is a JSON header containing the DSN.
  const firstLine = envelope.split('\n')[0]
  let header: unknown
  try {
    header = JSON.parse(firstLine)
  } catch {
    return sentryTunnelErrorResponse(
      request,
      400,
      'Invalid envelope header',
      'INVALID_INPUT',
      'invalid_envelope_header',
    )
  }

  const dsn =
    typeof header === 'object' && header !== null
      ? (header as Record<string, unknown>).dsn
      : undefined
  if (typeof dsn !== 'string') {
    return sentryTunnelErrorResponse(request, 400, 'Missing DSN', 'INVALID_INPUT', 'missing_dsn')
  }

  let dsnUrl: URL
  try {
    dsnUrl = new URL(dsn)
  } catch {
    return sentryTunnelErrorResponse(request, 400, 'Invalid DSN', 'INVALID_INPUT', 'invalid_dsn')
  }

  // Validate host to prevent open-proxy abuse: only forward to the known Sentry instance.
  if (dsnUrl.host !== SENTRY_HOST) {
    return sentryTunnelErrorResponse(request, 403, 'Forbidden', 'FORBIDDEN', 'host_not_allowed')
  }

  // Validate project ID against the allowlist.
  const projectId = dsnUrl.pathname.replace(/^\//, '')
  if (!SENTRY_PROJECT_IDS.has(projectId)) {
    return sentryTunnelErrorResponse(request, 403, 'Forbidden', 'FORBIDDEN', 'project_not_allowed')
  }

  const sentryUrl = `https://${SENTRY_HOST}/api/${projectId}/envelope/`
  let sentryRes: Response
  try {
    // Return a minimal response rather than forwarding Sentry's response verbatim.
    // Forwarding the raw response would expose internal headers (X-Sentry-Rate-Limit-*,
    // Retry-After, Server, etc.) to browser clients that should not see them.
    sentryRes = await fetch(sentryUrl, {
      method: 'POST',
      body: envelope,
      headers: { 'content-type': 'application/x-sentry-envelope' },
    })
  } catch (error) {
    logSentryTunnelForwardFailure(request, projectId, error, getSentryEnvelopeDiagnostics(envelope))
    return edgeErrorResponse(502, 'Bad Gateway', 'BAD_GATEWAY')
  }
  if (sentryRes.status < 200 || sentryRes.status >= 300) {
    logSentryTunnelUpstreamResponse(
      request,
      projectId,
      sentryRes.status,
      getSentryEnvelopeDiagnostics(envelope),
    )
  }
  return withFailureNoStoreHeaders(new Response(null, { status: sentryRes.status }))
}
