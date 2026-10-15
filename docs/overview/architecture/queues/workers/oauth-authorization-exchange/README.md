# OAuth Authorization Exchange Worker

Source entrypoint: [backend/workers/oauth-authorization-exchange/README.md](../../../../../../backend/workers/oauth-authorization-exchange/README.md)

Runs the ID-only OAuth authorization exchange and PostgreSQL recovery dispatcher jobs from
[`@queues/oauth-authorization-exchange`](../../oauth-authorization-exchange/README.md).
Provider exchange and durable state transitions remain in `@services/oauth`; the worker processors
only route jobs to those service operations.

`@workers/oauth-authorization-exchange` has no worker of its own:
`oauthAuthorizationExchangeHandlers` registers the two job names with the shared
[background worker](../background/README.md), which serves them with a baseline concurrency of 4
(added to the shared worker's baseline), no domain-wide cap, and the domain's pause switch. Only the
recovery dispatcher is serialized, under the `oauth-authorization-exchange:dispatcher` ordering key.

## Related

- [Valkey request budget](VALKEY_REQUESTS.md)
- [Worker entrypoint](../../../backend/entrypoints/worker-io/README.md)
