// Sentry tunnel endpoint — proxies browser Sentry envelopes through the CF Worker
// to bypass ad-blockers and ensure delivery reliability. The tunnel validates the
// DSN host and project ID from each envelope before forwarding.
//
// References:
//   https://docs.sentry.io/platforms/javascript/troubleshooting/#using-the-tunnel-option

import { edgeErrorResponse, withFailureNoStoreHeaders } from './error-response.mts'
import { getSentryDsnConfig, type SentryDsnConfig } from '@ts-shared/utils/sentry-deployment-gate'
import { getSentryEnvelopeDiagnostics } from './sentry-envelope-diagnostics.mts'
import {
  logSentryTunnelForwardFailure,
  logSentryTunnelRejection,
  logSentryTunnelUpstreamResponse,
  type SentryTunnelRejectReason,
} from './sentry-tunnel-diagnostics.mts'
import type { Env } from './types.mts'

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

function getTrustedSentryDsns(env: Env): SentryDsnConfig[] {
  const webDsn = getSentryDsnConfig(env.SENTRY_WEB_DSN)
  const previousWebDsn =
    webDsn === undefined ? undefined : getSentryDsnConfig(env.SENTRY_TUNNEL_PREVIOUS_WEB_DSN)
  return [webDsn, previousWebDsn, getSentryDsnConfig(env.SENTRY_DSN)].filter(
    (dsn): dsn is SentryDsnConfig => dsn !== undefined,
  )
}

export async function handleSentryTunnel(request: Request, env: Env): Promise<Response> {
  const trustedDsns = getTrustedSentryDsns(env)
  if (trustedDsns.length === 0) {
    return sentryTunnelErrorResponse(
      request,
      503,
      'Service Unavailable',
      'SERVICE_UNAVAILABLE',
      'configuration_unavailable',
    )
  }
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

  const envelopeDsn = getSentryDsnConfig(dsn)
  if (!envelopeDsn) {
    return sentryTunnelErrorResponse(request, 400, 'Invalid DSN', 'INVALID_INPUT', 'invalid_dsn')
  }

  const trustedDsn = trustedDsns.find(({ dsn: configuredDsn }) => configuredDsn === envelopeDsn.dsn)
  if (!trustedDsn) {
    return sentryTunnelErrorResponse(request, 403, 'Forbidden', 'FORBIDDEN', 'dsn_not_allowed')
  }

  const { envelopeUrl: sentryUrl, projectId } = trustedDsn
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
