import { buildRuntimeSentryConfigScript } from '@ts-shared/utils/runtime-sentry-config-script'
import type { Env } from './types.mts'

export const RUNTIME_SENTRY_CONFIG_PATH = '/runtime-sentry-config.js'

/** Serves the minimal runtime config needed when Next's global-error document replaces RootLayout. */
export function getRuntimeSentryConfigResponse(request: Request, env: Env): Response | null {
  const url = new URL(request.url)
  if (url.pathname !== RUNTIME_SENTRY_CONFIG_PATH || !['GET', 'HEAD'].includes(request.method)) {
    return null
  }
  return new Response(
    request.method === 'HEAD'
      ? null
      : buildRuntimeSentryConfigScript(env.ENVIRONMENT, env.SENTRY_WEB_DSN),
    {
      headers: {
        'cache-control': 'no-store',
        'content-type': 'application/javascript; charset=utf-8',
      },
    },
  )
}
