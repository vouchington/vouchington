#!/usr/bin/env node
import {
  CLOUDFLARE_TURNSTILE_TEST_SECRET_KEY,
  CLOUDFLARE_TURNSTILE_TEST_SECRET_KEYS,
} from '@services/captcha'
import app from './index.mts'
import {
  shouldRejectSkipCaptchaVerification,
  shouldRejectTurnstileTestSecret,
} from './boot-guards.mts'
import dashboardApp from './glidemq-dashboard.mts'
import http from 'node:http'
import onError, { flushSentry } from '@modules/on-error'
import { enableApiEgressGuardrail } from '@modules/utils'
import { validateRuntimeImageOrigin } from '@modules/utils/image-origin'
import { installApiEgressProxyRoutingResolver } from '@modules/api-egress-proxy'
import { isApiEgressProxyEnabled } from '@services/api-egress-proxy'
import { createWorkerSecretValidator, isAdminDashboardRequest } from './dashboard-auth.mts'
import { createOriginGuardedListener } from '@voucha/api/app'
import { registerProductionApiShutdownCallbacks } from './shutdown.mts'
import { exitAfterErrorReporting, startApiServer } from './startup.mts'

function exitWithFailure() {
  /* v8 ignore next 2 -- process-exit scheduling is exercised by production bootstrap failure paths. */
  process.exitCode = 1
  setTimeout(() => process.exit(1), 0).unref()
}

validateRuntimeImageOrigin()
// Enables the API egress guardrail (warn-mode) for this process only — never the worker, which
// legitimately egresses to arbitrary IPv4-only hosts. See @modules/utils/http-dispatchers.mts.
/* v8 ignore next -- production bootstrap side effect; this module runs only in the real API process (serve.test.mts reads it as source text rather than importing it). */
enableApiEgressGuardrail()

installApiEgressProxyRoutingResolver(isApiEgressProxyEnabled)

// On a deployed environment (staging or production), the Turnstile secret must be a real key —
// never any of Cloudflare's public test secrets (always-pass, always-fail, token-already-spent).
// Dev/test fall back to the always-pass test secret automatically (see @services/captcha).
const turnstileSecretKey =
  process.env.CLOUDFLARE_TURNSTILE_SECRET_KEY?.trim() || CLOUDFLARE_TURNSTILE_TEST_SECRET_KEY
if (shouldRejectTurnstileTestSecret(turnstileSecretKey, CLOUDFLARE_TURNSTILE_TEST_SECRET_KEYS)) {
  /* v8 ignore next 4 -- fatal deployed-only bootstrap guard exits the process. */
  console.error(
    'FATAL: CLOUDFLARE_TURNSTILE_SECRET_KEY is unset, blank, or a public Cloudflare test secret on a deployed environment. Set a real Cloudflare Turnstile secret key.',
  )
  exitWithFailure()
}

// SKIP_CAPTCHA_VERIFICATION disables Turnstile verification for tests/integration. It must never
// be set on a deployed environment, where it would let bots bypass CAPTCHA on every protected
// endpoint.
/* v8 ignore next 5 -- fatal deployed-only bootstrap guard exits the process. */
if (shouldRejectSkipCaptchaVerification()) {
  console.error(
    'FATAL: SKIP_CAPTCHA_VERIFICATION must not be set on a deployed environment. Unset it to enforce Turnstile verification.',
  )
  exitWithFailure()
}

const PORT = Number(process.env.PORT) || 3000
const DASHBOARD_PREFIX = '/admin/mq-dashboard'
const isWorkerSecretValid = createWorkerSecretValidator()

const apiCallback = createOriginGuardedListener(app.callback())

async function handleApiRequest(req: http.IncomingMessage, res: http.ServerResponse) {
  const url = req.url ?? '/'
  const pathname = url.split('?')[0]
  if (pathname === DASHBOARD_PREFIX || pathname.startsWith(`${DASHBOARD_PREFIX}/`)) {
    if (!isWorkerSecretValid(req)) {
      res.writeHead(403, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ message: 'Forbidden' }))
      return
    }
    let isAdmin = false
    try {
      isAdmin = await isAdminDashboardRequest(req)
    } catch (error) {
      onError(error instanceof Error ? error : new Error(String(error)))
    }
    if (!isAdmin) {
      res.writeHead(401, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ message: 'Unauthorized' }))
      return
    }
    req.url = (pathname.slice(DASHBOARD_PREFIX.length) || '/') + url.slice(pathname.length)
    dashboardApp(req, res)
    return
  }
  apiCallback(req, res)
}

// Explicit, SSE-safe values equal to Node's own http.Server defaults
// (docs/development/runtime-timeouts.md) — zero-behavior-change, greppable intent.
// requestTimeout bounds only the incoming request's headers+body receipt, not response
// duration, so it does not cut long-lived SSE responses. headersTimeout/keepAliveTimeout
// are likewise request/connection-setup bounds. `timeout` (server.timeout, the legacy
// socket-inactivity timeout) is intentionally left unset/disabled (0) — a positive value
// would cut sparse-write SSE streams (data-request, imports) mid-flight.
/* v8 ignore next 4 -- constructing the real listener is exercised only by process startup, not unit tests (see serve.test.mts's source-string assertions for value coverage). */
const server = http.createServer(
  { requestTimeout: 300_000, headersTimeout: 60_000, keepAliveTimeout: 5_000 },
  handleApiRequest,
)

registerProductionApiShutdownCallbacks(server, { log: message => console.log(message) })

// Catch errors that escape route/middleware handlers so they still reach Sentry
// (e.g. errors thrown in unawaited async work or timer callbacks).
process.on('uncaughtException', err => {
  onError(err instanceof Error ? err : new Error(String(err)))
  // Flush pending Sentry events before exiting; bounded to avoid hanging.
  /* v8 ignore next -- fatal process handler exits after Sentry flush. */
  exitAfterErrorReporting(() => flushSentry(2000), exitWithFailure)
})
process.on('unhandledRejection', reason => {
  onError(reason instanceof Error ? reason : new Error(String(reason)))
})

/* v8 ignore start -- production bootstrap adapters; startApiServer has direct callback coverage. */
if (process.env.PLAYWRIGHT_TEST === 'true') {
  const { ensurePlaywrightLocalizationSqlite } =
    await import('@services/localization/compile-catalog')
  await ensurePlaywrightLocalizationSqlite()
}
startApiServer(server, PORT, {
  exitWithFailure,
  flushErrorReporting: () => flushSentry(2000),
  logError: error => console.error(error),
  logListening: listeningPort =>
    console.log('API Server: serving at http://localhost:%s', listeningPort),
  reportError: onError,
})
/* v8 ignore stop */
