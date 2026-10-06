export type ConnectionShutdown = () => Promise<void>

export interface DataStoreShutdownDeps {
  onGracefulShutdownValkey?: ConnectionShutdown
  onGracefulShutdownPSQL?: ConnectionShutdown
  logger?: (...args: unknown[]) => void
}

export function createDataStoreShutdownRegistry(defaultLogger: (...args: unknown[]) => void) {
  const noopConnectionShutdown: ConnectionShutdown = async () => {}
  let registeredValkeyShutdown: ConnectionShutdown = noopConnectionShutdown
  let registeredPSQLShutdown: ConnectionShutdown = noopConnectionShutdown

  function registerGracefulShutdownValkey(shutdown: ConnectionShutdown): void {
    registeredValkeyShutdown = shutdown
  }

  function registerGracefulShutdownPSQL(shutdown: ConnectionShutdown): void {
    registeredPSQLShutdown = shutdown
  }

  async function close(deps: DataStoreShutdownDeps = {}): Promise<Error[]> {
    const shutdownValkey = deps.onGracefulShutdownValkey ?? registeredValkeyShutdown
    const shutdownPSQL = deps.onGracefulShutdownPSQL ?? registeredPSQLShutdown
    const shutdownLog = deps.logger ?? defaultLogger
    const results = await Promise.allSettled([
      Promise.resolve().then(shutdownValkey),
      Promise.resolve().then(shutdownPSQL),
    ])

    if (results[0].status === 'fulfilled') {
      shutdownLog('Graceful Shutdown: Valkey connection closed.')
    }
    if (results[1].status === 'fulfilled') {
      shutdownLog('Graceful Shutdown: PostgreSQL connection closed.')
    }

    return results.flatMap(result => (result.status === 'rejected' ? [toError(result.reason)] : []))
  }

  return { registerGracefulShutdownValkey, registerGracefulShutdownPSQL, close }
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error))
}
