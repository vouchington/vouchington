export type SentryTunnelRejectReason =
  | 'content_length_too_large'
  | 'body_too_large'
  | 'body_read_error'
  | 'invalid_envelope_header'
  | 'missing_dsn'
  | 'invalid_dsn'
  | 'configuration_unavailable'
  | 'dsn_not_allowed'

type SentryTunnelDiagnosticDetails = {
  envelopeItemCount?: number
  envelopeItemTypes?: string[]
  errorName?: string
  errorCauseName?: string
  errorCode?: string
  limitBytes?: number
  projectId?: string
}

type CloudflareRayRequest = Request & {
  readonly cf?: {
    readonly ray?: string
  }
}

const ERROR_CODE_PATTERN = /^[A-Za-z0-9_.-]{1,64}$/

function getRequestDiagnostics(request: Request) {
  const contentLength = request.headers.get('content-length')
  const contentLengthBytes = contentLength === null ? undefined : Number(contentLength)
  const cfRay =
    (request as CloudflareRayRequest).cf?.ray ?? request.headers.get('cf-ray') ?? undefined
  const requestPath = getRequestPath(request)

  return {
    method: request.method,
    ...(requestPath === undefined ? {} : { requestPath }),
    ...(cfRay === undefined ? {} : { cfRay }),
    ...(typeof contentLengthBytes === 'number' && Number.isFinite(contentLengthBytes)
      ? { contentLengthBytes }
      : {}),
  }
}

function getRequestPath(request: Request): string | undefined {
  try {
    return new URL(request.url).pathname
  } catch {
    return undefined
  }
}

export function logSentryTunnelRejection(
  request: Request,
  status: number,
  reason: SentryTunnelRejectReason,
  details: SentryTunnelDiagnosticDetails = {},
): void {
  console.warn(
    JSON.stringify({
      message: 'sentry_tunnel_rejected',
      reason,
      status,
      ...getRequestDiagnostics(request),
      ...details,
    }),
  )
}

export function logSentryTunnelForwardFailure(
  request: Request,
  projectId: string,
  error: unknown,
  details: SentryTunnelDiagnosticDetails = {},
): void {
  const errorDiagnostics = getErrorDiagnostics(error)

  console.error(
    JSON.stringify({
      message: 'sentry_tunnel_forward_failed',
      reason: 'sentry_fetch_error',
      status: 502,
      ...getRequestDiagnostics(request),
      projectId,
      ...details,
      ...errorDiagnostics,
    }),
  )
}

export function logSentryTunnelUpstreamResponse(
  request: Request,
  projectId: string,
  status: number,
  details: SentryTunnelDiagnosticDetails = {},
): void {
  console.warn(
    JSON.stringify({
      message: 'sentry_tunnel_upstream_response',
      reason: 'sentry_upstream_non_2xx',
      status,
      ...getRequestDiagnostics(request),
      projectId,
      ...details,
    }),
  )
}

function getErrorDiagnostics(error: unknown): SentryTunnelDiagnosticDetails {
  const details: SentryTunnelDiagnosticDetails = {
    errorName: getErrorName(error),
  }

  const errorCode = getSafeErrorCode(error)
  if (errorCode !== undefined) {
    details.errorCode = errorCode
  }

  const cause = getErrorCause(error)
  if (cause !== undefined && cause !== null) {
    const causeName = getErrorInstanceName(cause)
    if (causeName !== undefined) {
      details.errorCauseName = causeName
    }
    details.errorCode ??= getSafeErrorCode(cause)
  }

  return details
}

function getErrorName(error: unknown): string {
  return getErrorInstanceName(error) ?? typeof error
}

function getErrorInstanceName(error: unknown): string | undefined {
  try {
    if (!(error instanceof Error)) {
      return undefined
    }

    return typeof error.name === 'string' ? error.name : undefined
  } catch {
    return undefined
  }
}

function getErrorCause(error: unknown): unknown {
  try {
    if (!(error instanceof Error)) {
      return undefined
    }

    return error.cause
  } catch {
    return undefined
  }
}

function getSafeErrorCode(error: unknown): string | undefined {
  try {
    if (typeof error !== 'object' || error === null) {
      return undefined
    }

    const code = (error as { code?: unknown }).code
    if (typeof code !== 'string' && typeof code !== 'number') {
      return undefined
    }

    const normalized = String(code)
    return ERROR_CODE_PATTERN.test(normalized) ? normalized : undefined
  } catch {
    return undefined
  }
}
