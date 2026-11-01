import { addGracefulShutdownCallback } from '@data-stores/graceful-shutdown'
import { parseArgs } from 'node:util'
import http from 'node:http'
import { createOriginGuardedListener } from '@voucha/api/app'
import app from './entrypoints/api/index.mts'
import './entrypoints/worker-io/serve.mts'

const { values } = parseArgs({
  options: {
    port: { type: 'string', short: 'p' },
  },
})

const PORT = Number(values.port || process.env.PORT || 3000)
// Matches http-terminator's own default grace window for draining in-flight HTTP
// connections before forcing them closed.
const GRACEFUL_TERMINATION_TIMEOUT_MS = 1_000

// Duplicated from backend/entrypoints/api/shutdown.mts: exporting it from that production
// entrypoint solely for this dev-only consumer trips the knip-production-exports gate, which
// requires every export from backend/entrypoints/api to have a production-reachable consumer.
function terminateHttpServer(server: http.Server): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      server.closeAllConnections()
    }, GRACEFUL_TERMINATION_TIMEOUT_MS)
    timer.unref()

    server.close(error => {
      clearTimeout(timer)
      if (error) {
        reject(error)
      } else {
        resolve()
      }
    })

    server.closeIdleConnections()
  })
}

const server = http.createServer(createOriginGuardedListener(app.callback()))

server.once('error', (err: Error) => {
  console.error(err.stack)
  process.exit(1)
})

server.listen(PORT, '0.0.0.0', () => {
  console.log('Dev Server: API serving at http://localhost:%s', PORT)
  console.log('Dev Server: Workers initialized')

  addGracefulShutdownCallback(async () => {
    console.log('Dev Server: shutting down...')
    await terminateHttpServer(server)
    console.log('Dev Server: closed.')
  })
})
