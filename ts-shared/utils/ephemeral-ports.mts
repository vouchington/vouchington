import type { Server } from 'node:net'

const DEFAULT_MAX_BIND_ATTEMPTS = 100

export type ListenOnHost = (server: Server, host: string) => Promise<void>

export interface EphemeralListenerOptions {
  isAllowedPort?: (port: number) => boolean
  listen?: ListenOnHost
  maxBindAttempts?: number
}

export class EphemeralListenerAttemptsExhaustedError extends Error {
  readonly maxBindAttempts: number

  constructor(maxBindAttempts: number) {
    super(`Failed to bind an allowed ephemeral port after ${maxBindAttempts} attempts`)
    this.name = 'EphemeralListenerAttemptsExhaustedError'
    this.maxBindAttempts = maxBindAttempts
  }
}

/**
 * Binds `server` to an ephemeral port (0), retrying against a fresh port
 * when `isAllowedPort` rejects the one bound. With no predicate this
 * resolves on the first bind, i.e. a plain port-0 listen.
 */
export async function listenOnEphemeralPort(
  server: Server,
  host: string,
  options: EphemeralListenerOptions = {},
): Promise<number> {
  const maxBindAttempts = options.maxBindAttempts ?? DEFAULT_MAX_BIND_ATTEMPTS
  for (let attempt = 0; attempt < maxBindAttempts; attempt += 1) {
    await (options.listen ?? listenOnHost)(server, host)
    const port = getBoundPort(server)
    if (options.isAllowedPort?.(port) ?? true) {
      return port
    }
    await closeServer(server)
  }
  throw new EphemeralListenerAttemptsExhaustedError(maxBindAttempts)
}

function listenOnHost(server: Server, host: string): Promise<void> {
  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, host, () => {
      server.off('error', reject)
      resolve()
    })
  })
}

function getBoundPort(server: Server): number {
  const address = server.address()
  if (!address || typeof address === 'string') {
    throw new Error('Failed to allocate listener port')
  }
  return address.port
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close(error => {
      if (error) reject(error)
      else resolve()
    })
  })
}
