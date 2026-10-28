import http from 'node:http'
import { vi } from 'vitest'
import { listenOnRunnerUnreservedEphemeralPort } from 'vouchington-tooling/runner-port-policy'

export async function startLambdaDevServer(): Promise<{ server: http.Server; origin: string }> {
  let server: http.Server | undefined
  // Import the actual CLI under Vitest coverage, deferring its bind to an owned loopback port.
  const listenSpy = vi.spyOn(http.Server.prototype, 'listen').mockImplementationOnce(function (
    this: http.Server,
    ...args: unknown[]
  ) {
    const onListening = args[1]
    if (typeof onListening === 'function') {
      this.once('listening', () => Reflect.apply(onListening, this, []))
    }
    return this
  })
  try {
    vi.resetModules()
    await import('../dev-server.mts')
    const result = listenSpy.mock.results[0]
    if (result?.type === 'return') server = result.value
  } finally {
    listenSpy.mockRestore()
  }
  if (!server) throw new Error('Lambda dev server did not start a listener')
  const port = await listenOnRunnerUnreservedEphemeralPort(server, '127.0.0.1')
  return { server, origin: `http://127.0.0.1:${port}` }
}
