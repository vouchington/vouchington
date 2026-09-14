import { buildRuntimeSentryConfigScript } from '@ts-shared/utils/runtime-sentry-config-script'

export const dynamic = 'force-dynamic'

const responseHeaders = {
  'cache-control': 'no-store',
  'content-type': 'application/javascript; charset=utf-8',
}

export function GET(): Response {
  return new Response(
    buildRuntimeSentryConfigScript(process.env.ENVIRONMENT, process.env.SENTRY_WEB_DSN),
    { headers: responseHeaders },
  )
}

export function HEAD(): Response {
  return new Response(null, { headers: responseHeaders })
}
