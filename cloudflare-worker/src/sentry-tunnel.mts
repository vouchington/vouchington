// The app selects the current and retiring browser DSNs; the published edge tunnel owns
// envelope validation, bounded reading, forwarding, and diagnostics.
import { getSentryDsnConfig } from '@ts-shared/utils/sentry-deployment-gate'
import { createSentryTunnel } from '@vouchington/edge'
import type { Env } from './types.mts'

export function handleSentryTunnel(request: Request, env: Env): Promise<Response> {
  const webDsn = getSentryDsnConfig(env.SENTRY_WEB_DSN)
  const previousWebDsn = webDsn ? getSentryDsnConfig(env.SENTRY_TUNNEL_PREVIOUS_WEB_DSN) : undefined
  const workerDsn = getSentryDsnConfig(env.SENTRY_DSN)
  const trustedDsns = [webDsn?.dsn, previousWebDsn?.dsn, workerDsn?.dsn]
  return createSentryTunnel({ trustedDsns })(request)
}
