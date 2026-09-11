import type http from 'node:http'

type ApiStartupDeps = {
  exitWithFailure: () => void
  flushErrorReporting: () => Promise<void>
  logError: (error: Error) => void
  logListening: (port: number) => void
  reportError: (error: Error) => void
}

export function exitAfterErrorReporting(
  flushErrorReporting: () => Promise<void>,
  exitWithFailure: () => void,
): void {
  // Keep both outcomes on one link: adding `.catch` would delay rejection exit by a microtask.
  // oxlint-disable-next-line promise/prefer-catch, promise/catch-or-return
  flushErrorReporting().then(exitWithFailure, exitWithFailure)
}

export function startApiServer(
  server: http.Server,
  port: number,
  { exitWithFailure, flushErrorReporting, logError, logListening, reportError }: ApiStartupDeps,
): void {
  function handleServerStartupError(error: Error) {
    logError(error)
    reportError(error)
    exitAfterErrorReporting(flushErrorReporting, exitWithFailure)
  }

  server.once('error', handleServerStartupError)
  // IPv6-only ECS tasks (#7987) have no IPv4 address on the task ENI. Binding '::' with the
  // default net.ipv6.bindv6only=0 accepts both IPv6 and IPv4-mapped loopback/ALB connections.
  server.listen(port, '::', () => {
    server.off('error', handleServerStartupError)
    logListening(port)
  })
}
