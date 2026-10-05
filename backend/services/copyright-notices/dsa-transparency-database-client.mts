import { getExternalFetch } from '@modules/utils/http-dispatchers'
import { assertDsaStatementPayload, type DsaStatementPayload } from './dsa-statement-payload.mts'

type ExternalFetch = ReturnType<typeof getExternalFetch>

export type DsaStatementSubmitResult =
  | { kind: 'submitted'; uuid: string; statusCode: 201 | 422 }
  | {
      kind: 'retryable_failure' | 'permanent_failure'
      statusCode: number | null
      errorCode: string
    }
  | { kind: 'configuration_missing' }

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Only EU-hosted HTTPS endpoints are accepted; credentials never enter the URL. */
function statementUrl(baseUrl: string): URL | null {
  let base: URL
  try {
    base = new URL(baseUrl)
  } catch {
    return null
  }
  if (
    base.protocol !== 'https:' ||
    !base.hostname.endsWith('.europa.eu') ||
    base.username ||
    base.password ||
    base.search ||
    base.hash
  )
    return null
  base.pathname = `${base.pathname.replace(/\/+$/, '')}/statement`
  return base
}

/** Never return, store, or log the remote body or bearer token. */
/* no-mistakes: integration=http */
export async function submitDsaTransparencyDatabaseStatement(
  payload: DsaStatementPayload,
  credentials: { url: string; token: string },
  requestFetch: ExternalFetch = getExternalFetch(),
): Promise<DsaStatementSubmitResult> {
  assertDsaStatementPayload(payload)
  const url = credentials.url.trim() ? statementUrl(credentials.url.trim()) : null
  const token = credentials.token.trim()
  if (!url || !token) return { kind: 'configuration_missing' }
  const signal = AbortSignal.timeout(10_000)
  let response: Response
  try {
    response = await requestFetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      redirect: 'error',
      signal,
    })
  } catch {
    return {
      kind: 'retryable_failure',
      statusCode: null,
      errorCode: signal.aborted ? 'timeout' : 'network_error',
    }
  }
  if (response.status === 201 || response.status === 422) {
    let body: unknown
    try {
      body = await response.json()
    } catch {
      return {
        kind: signal.aborted || response.status === 201 ? 'retryable_failure' : 'permanent_failure',
        statusCode: response.status,
        errorCode: signal.aborted
          ? 'timeout'
          : response.status === 422
            ? 'http_422'
            : 'invalid_response',
      }
    }
    const existing = isRecord(body) && isRecord(body.existing) ? body.existing.uuid : null
    const uuid = response.status === 201 && isRecord(body) ? body.uuid : existing
    if (typeof uuid === 'string' && uuidPattern.test(uuid))
      return { kind: 'submitted', uuid, statusCode: response.status }
    return response.status === 201
      ? { kind: 'retryable_failure', statusCode: 201, errorCode: 'invalid_response' }
      : { kind: 'permanent_failure', statusCode: 422, errorCode: 'http_422' }
  }
  return response.status === 401 || response.status === 429 || response.status >= 500
    ? {
        kind: 'retryable_failure',
        statusCode: response.status,
        errorCode: `http_${response.status}`,
      }
    : {
        kind: 'permanent_failure',
        statusCode: response.status,
        errorCode: `http_${response.status}`,
      }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
