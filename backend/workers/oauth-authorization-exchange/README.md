# OAuth Authorization Exchange Worker

Runs the ID-only OAuth authorization exchange and PostgreSQL recovery dispatcher jobs from
[`@queues/oauth-authorization-exchange`](../../queues/oauth-authorization-exchange/README.md).
Provider exchange and durable state transitions remain in `@services/oauth`; the worker processors
only route jobs to those service operations.

The worker is I/O-capable, fixed at concurrency 4, and registered in the worker-I/O definition
catalog. Its deployed worker runtime is selected by infrastructure.

## Related

- [Valkey request budget](VALKEY_REQUESTS.md)
- [Worker entrypoint](../../entrypoints/worker-io/README.md)
