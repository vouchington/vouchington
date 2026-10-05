# Graceful Shutdown Data Store

Source entrypoint: [backend/data-stores/graceful-shutdown/README.md](../../../../../../backend/data-stores/graceful-shutdown/README.md)

Owns process shutdown callback registration for data-store cleanup and other runtime teardown work.

## Exports

- `addGracefulShutdownCallback` - registers an async callback to run during shutdown.
- `addGracefulShutdownDrainCallback` - registers an async drain-phase callback.
- `onGracefulShutdown` - handles process shutdown signals and drains callbacks.
- `gracefulShutdown` - closes data-store connections.
- `shutdownDataStoresForOneOffCommand` - quietly closes every data store for a one-off entrypoint,
  propagates aggregated cleanup failures, and bounds stuck cleanup or residual native handles with
  the process grace-period timer.

Connection registration and close behavior are exercised with an owned
[data-store shutdown registry](../../../../../../backend/data-stores/graceful-shutdown/data-store-shutdown-registry.test.mts).
[Native wiring guards](../../../../../development/quality/static-code-analysis/README.md)
require each Valkey concern entrypoint to load and register the actual shutdown owner.

## Related

- Graceful shutdown overview: [../../../docs/overview/architecture/graceful-shutdown.md](../../../graceful-shutdown.md)
- Data stores overview: [../README.md](../README.md)
