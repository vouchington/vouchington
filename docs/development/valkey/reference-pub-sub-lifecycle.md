# Pub/Sub Lifecycle

[Back to Valkey Data Store](README.md#related-checklists)

`createChannelPubSub()` creates dedicated publish and subscriber clients for SSE fanout, separate
from the shared cache, rate limiter, session, and GlideMQ clients.

Subscriber owners must close both subscription handles and long-lived subscriber clients: SSE
routes close the subscription in `finally`, tests close shared subscribers in `afterAll`, and
fire-and-forget publishes or queue `signal()` calls attach `.catch(onError)` or a narrowly justified
benign catch. `closeSubscriber()` is restricted to an idle owner so a direct call cannot silently
drop SSE delivery; process shutdown uses the registered owner `close()`.

Pub/sub is a best-effort live notification layer. Durable state remains in Postgres, and reconnect
paths must recover from the source of truth rather than assume every message was delivered.
