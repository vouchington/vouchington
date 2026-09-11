# Graceful Shutdown Data Store

Owns process shutdown callback registration for data-store cleanup and other runtime teardown work.

## Exports

- `addGracefulShutdownCallback` - registers an async callback to run during shutdown.
- `addGracefulShutdownDrainCallback` - registers an async drain-phase callback.
- `isGracefulShutdownValkeyRegistered` - reports whether Valkey shutdown has registered itself.
- `onGracefulShutdown` - handles process shutdown signals and drains callbacks.
- `gracefulShutdown` - closes data-store connections.
- `shutdownDataStoresForOneOffCommand` - quietly closes every data store for a one-off entrypoint,
  propagates aggregated cleanup failures, and bounds stuck cleanup or residual native handles with
  the process grace-period timer.

## Related

- Graceful shutdown overview: [../../../docs/overview/architecture/graceful-shutdown.md](../../../docs/overview/architecture/graceful-shutdown.md)
- Data stores overview: [../README.md](../README.md)
