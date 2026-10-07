import { getExternalFetch } from '@modules/utils'
import { suppressSentryTracing } from '@modules/on-error'
import { context } from '@opentelemetry/api'
import { suppressTracing } from '@opentelemetry/core'

const GRAFANA_HEARTBEAT_TIMEOUT_MS = 5_000

type ExternalFetch = ReturnType<typeof getExternalFetch>

const defaultDependencies = { fetch: getExternalFetch() }

export function validateHeartbeatUrl(value: string): URL {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new Error('GRAFANA_IRM_HEARTBEAT_URL must be an HTTPS grafana.net endpoint')
  }
  if (url.protocol !== 'https:' || !url.hostname.endsWith('.grafana.net')) {
    throw new Error('GRAFANA_IRM_HEARTBEAT_URL must be an HTTPS grafana.net endpoint')
  }
  return url
}

/* no-mistakes: integration=http */
export async function sendGrafanaHeartbeat(
  heartbeatUrl: string,
  requestFetch: ExternalFetch = defaultDependencies.fetch,
  signal?: AbortSignal,
): Promise<void> {
  const url = validateHeartbeatUrl(heartbeatUrl)
  // The Grafana IRM credential is embedded in the URL path. Suppress this one request in both
  // Sentry and OpenTelemetry so neither can export it as url.full.
  const response = await suppressSentryTracing(() =>
    context.with(suppressTracing(context.active()), () =>
      requestFetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
        redirect: 'error',
        signal: signal
          ? AbortSignal.any([signal, AbortSignal.timeout(GRAFANA_HEARTBEAT_TIMEOUT_MS)])
          : AbortSignal.timeout(GRAFANA_HEARTBEAT_TIMEOUT_MS),
      }),
    ),
  )
  if (!response.ok) {
    throw new Error(`Grafana IRM heartbeat returned HTTP ${response.status}`)
  }
}
