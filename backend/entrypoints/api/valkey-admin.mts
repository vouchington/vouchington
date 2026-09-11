import { runValkeyAdminCommand } from './valkey-admin-command.mts'
import { installOneOffSignalCancellation } from './valkey-admin-signal-cancellation.mts'

/* c8 ignore start -- process entrypoint exercised through the deployed API image smoke test. */
const cancellation = installOneOffSignalCancellation()
try {
  process.exitCode = await runValkeyAdminCommand(
    process.argv.slice(2),
    process.env,
    async registerPartialInitializationShutdown => {
      const { onGracefulShutdown, shutdownDataStoresForOneOffCommand } =
        await import('@data-stores/graceful-shutdown')
      cancellation.removeStandardListener(onGracefulShutdown)
      registerPartialInitializationShutdown(shutdownDataStoresForOneOffCommand)
      const { createValkeyAdminRuntime } = await import('./valkey-admin-runtime.mts')
      return createValkeyAdminRuntime()
    },
    undefined,
    undefined,
    cancellation.signal,
  )
} finally {
  cancellation.dispose()
}
/* c8 ignore stop */
