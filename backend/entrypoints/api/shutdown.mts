import {
  type addGracefulShutdownCallback,
  type addGracefulShutdownDrainCallback,
  addGracefulShutdownCallback as defaultAddGracefulShutdownCallback,
  addGracefulShutdownDrainCallback as defaultAddGracefulShutdownDrainCallback,
} from '@data-stores/graceful-shutdown'
import {
  type beginNativeAddonShutdown,
  type waitForNativeAddonWorkToDrain,
  beginNativeAddonShutdown as defaultBeginNativeAddonShutdown,
  waitForNativeAddonWorkToDrain as defaultWaitForNativeAddonWorkToDrain,
} from '@jongleberry/vurst-runtime'
import type http from 'node:http'

// Matches http-terminator's own default grace window for draining in-flight HTTP
// connections before forcing them closed.
const GRACEFUL_TERMINATION_TIMEOUT_MS = 1_000

type ApiShutdownDeps = {
  addShutdownCallback: typeof addGracefulShutdownCallback
  addDrainCallback: typeof addGracefulShutdownDrainCallback
  terminate: () => Promise<void>
  beginNativeShutdown: typeof beginNativeAddonShutdown
  waitForNativeDrain: typeof waitForNativeAddonWorkToDrain
  log: (message: string) => void
}

type ApiShutdownBootstrapDeps = Partial<Omit<ApiShutdownDeps, 'terminate'>>

export function registerApiShutdownCallbacks({
  addShutdownCallback,
  addDrainCallback,
  terminate,
  beginNativeShutdown,
  waitForNativeDrain,
  log,
}: ApiShutdownDeps): void {
  addShutdownCallback(async () => {
    log('API Server: shutting down...')
    await terminate()
    log('API Server: closed.')
  })

  addDrainCallback(async () => {
    log('API Server: draining native addon work...')
    beginNativeShutdown()
    await waitForNativeDrain()
    log('API Server: native addon work drained.')
  })
}

/**
 * Stops accepting new connections, closes already-idle keep-alive sockets immediately, then
 * force-closes any sockets still open (mid-request) after a grace period. Replaces
 * `http-terminator`: unlike that package, this does not inject a `Connection: close` header
 * into in-flight responses, so a request that finishes during the grace period may leave its
 * now-idle keep-alive socket open until the forced close fires below — an accepted
 * simplification of http-terminator's manual socket tracking.
 */
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

export function registerProductionApiShutdownCallbacks(
  server: http.Server,
  {
    addShutdownCallback = defaultAddGracefulShutdownCallback,
    addDrainCallback = defaultAddGracefulShutdownDrainCallback,
    beginNativeShutdown = defaultBeginNativeAddonShutdown,
    waitForNativeDrain = defaultWaitForNativeAddonWorkToDrain,
    log = () => {},
  }: ApiShutdownBootstrapDeps = {},
): void {
  registerApiShutdownCallbacks({
    addShutdownCallback,
    addDrainCallback,
    terminate: () => terminateHttpServer(server),
    beginNativeShutdown,
    waitForNativeDrain,
    log,
  })
}
