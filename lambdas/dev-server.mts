import { spawnSync } from 'node:child_process'
import http from 'node:http'
import { fileURLToPath } from 'node:url'
import { handler as imageHandler } from './image-resize/index.mts'
import { httpRequestToLambdaEvent } from './image-resize/http-request-to-lambda-event.mts'
import {
  isPlaywrightPodcastCoverRequest,
  PLAYWRIGHT_PODCAST_COVER,
} from './playwright-podcast-cover.mts'

const PORT = Number(process.env.IMAGE_LAMBDA_PORT) || 3100

// Playwright CI holds this port until this process starts, then releases it in the
// webServer command. Retrying with jittered backoff still absorbs the remaining
// milliseconds between that release and this listen() call.
const MAX_LISTEN_ATTEMPTS = 5
const LISTEN_RETRY_BASE_DELAY_MS = 200
const LISTEN_RETRY_JITTER_MS = 200

// ci/diagnose-browser-port-collision.sh normally runs post-hoc, after Playwright has
// already torn down its webServer process group, so the collision evidence it probes
// for is already gone. Reusing it here, at the moment of EADDRINUSE itself, is what
// actually captures the process holding the port. CI sets BROWSER_PORT_DIAGNOSTICS_DIR
// to the same directory the "Diagnose browser port collision" composite action uploads
// as an artifact, so this needs no reporting path of its own; it is unset in local dev
// and tests, so this stays a no-op there.
const BIND_TIME_DIAGNOSTICS_TIMEOUT_SECONDS = '4'
const DIAGNOSTIC_SCRIPT_PATH = fileURLToPath(
  new URL('../ci/diagnose-browser-port-collision.sh', import.meta.url),
)

function captureBindTimeDiagnostics(port: number, attempt: number): void {
  const baseDir = process.env.BROWSER_PORT_DIAGNOSTICS_DIR
  if (!baseDir) return

  const outputDir = `${baseDir}/bind-time-attempt-${attempt}`
  try {
    const result = spawnSync(
      'bash',
      [DIAGNOSTIC_SCRIPT_PATH, '--ports', String(port), '--output-dir', outputDir],
      {
        env: {
          ...process.env,
          BROWSER_PORT_DIAGNOSTICS_TIMEOUT_SECONDS: BIND_TIME_DIAGNOSTICS_TIMEOUT_SECONDS,
        },
        stdio: 'ignore',
        timeout: 8_000,
      },
    )
    if (result.error) {
      console.warn(
        `Lambda dev server: bind-time port diagnostics did not run: ${result.error.message}`,
      )
    }
  } catch (error) {
    console.warn('Lambda dev server: bind-time port diagnostics threw unexpectedly:', error)
  }
}

export const server = http.createServer(async (req, res) => {
  const start = Date.now()
  const pathname = new URL(req.url ?? '/', 'http://localhost').pathname

  res.on('finish', () => {
    if (pathname !== '/health' && process.env.LOG_LEVEL === 'info') {
      console.log('%s %s %d %dms', req.method, pathname, res.statusCode, Date.now() - start)
    }
  })

  if (pathname === '/health') {
    req.resume()
    res.statusCode = 200
    res.end('ok')
    return
  }

  if (isPlaywrightPodcastCoverRequest(pathname)) {
    req.resume()
    res.statusCode = 200
    res.setHeader('Cache-Control', 'no-store')
    res.setHeader('Content-Type', 'image/png')
    res.end(PLAYWRIGHT_PODCAST_COVER)
    return
  }

  if (req.method !== 'GET') {
    req.resume()
    res.statusCode = 405
    res.setHeader('Allow', 'GET')
    res.end('Method Not Allowed')
    return
  }

  try {
    const event = httpRequestToLambdaEvent(req)
    const result = await imageHandler(event)

    for (const [key, value] of Object.entries(result.headers || {})) {
      res.setHeader(key, String(value))
    }
    for (const [key, values] of Object.entries(result.multiValueHeaders || {})) {
      res.setHeader(key, values.map(String))
    }

    res.statusCode = result.statusCode

    if (result.isBase64Encoded) {
      res.end(Buffer.from(result.body, 'base64'))
    } else {
      res.end(result.body)
    }
  } catch (error) {
    console.error('Lambda dev server error:', req.method, req.url, error)
    res.statusCode = 500
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ error: 'Internal server error' }))
  }
})

export interface ListenWithRetryOptions {
  maxAttempts?: number
}

export function listenWithRetry(
  target: http.Server,
  port: number,
  attempt = 1,
  options: ListenWithRetryOptions = {},
): void {
  const maxAttempts = options.maxAttempts ?? MAX_LISTEN_ATTEMPTS

  function onListening(): void {
    target.off('error', onError)
    console.log(`Lambda dev server: http://localhost:${port}`)
    console.log('  GET  /images/{key}         — image resize')
    console.log('  GET  /sideload/{base64url}  — sideload image resize')
    /* c8 ignore next -- dev-only stdout banner line; entry-point guard never executes under import-based tests */
    console.log('  GET  /og/{base64url}        — OG/Twitter share-card render')
  }

  function onError(error: NodeJS.ErrnoException): void {
    target.off('listening', onListening)
    // Capture on the first collision (the highest-value sample) and again on the final,
    // give-up attempt — not on every retry — to bound worst-case added latency to two
    // bash+python probe spawns instead of up to MAX_LISTEN_ATTEMPTS.
    if (error.code === 'EADDRINUSE' && (attempt === 1 || attempt >= maxAttempts)) {
      captureBindTimeDiagnostics(port, attempt)
    }
    // On a real http.Server this throw surfaces as an uncaughtException, not a
    // synchronous throw back to the listenWithRetry caller, because 'error' is
    // emitted asynchronously. It is intentional: the crash still happens, it
    // just doesn't happen on this call stack.
    if (error.code !== 'EADDRINUSE' || attempt >= maxAttempts) throw error

    const delayMs = LISTEN_RETRY_BASE_DELAY_MS + Math.random() * LISTEN_RETRY_JITTER_MS
    console.warn(
      `Lambda dev server: port ${port} in use (attempt ${attempt}/${maxAttempts}), retrying in ${Math.round(delayMs)}ms`,
    )
    setTimeout(() => listenWithRetry(target, port, attempt + 1, options), delayMs)
  }

  target.once('error', onError)
  target.listen(port, onListening)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  /* c8 ignore next -- entry-point guard never executes under import-based tests */
  listenWithRetry(server, PORT)
}
