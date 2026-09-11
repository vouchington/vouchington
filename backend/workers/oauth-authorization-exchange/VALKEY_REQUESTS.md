# Valkey Requests: OAuth Authorization Exchange

Application-level Valkey calls per job, excluding GlideMQ stream operations:

| Job                                   |                                                     Calls |
| ------------------------------------- | --------------------------------------------------------: |
| `exchangeOAuthAuthorization`          |                                                         0 |
| `dispatchOAuthAuthorizationExchanges` | `3–5`, plus one remove or retry per matching terminal job |

The dispatcher scans the bounded retained completed and failed sets once each. Each nonempty set
adds one metadata-hydration batch. It removes matching completed jobs, uses one bulk add for the
durable recovery page, and retries matching failed jobs. Provider exchange uses PostgreSQL plus
provider HTTPS APIs; the worker does not read application caches or sessions.
