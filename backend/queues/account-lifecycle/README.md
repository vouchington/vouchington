# Account lifecycle queue

The `account-lifecycle` domain of the shared `background` queue carries export, export cleanup/recovery, and user deletion/recovery jobs. The five distinct job names (`account-lifecycle.<name>`) retain their durable request and attempt identities, simple deduplication, retries, delays, and schedules. Processing jobs use priority 10; cleanup and recovery jobs use dispatcher priority 100. Every job shares one domain-wide group of two and a ten-minute per-job lock. The shared background worker consumes them.

See the [architecture guide](../../../docs/overview/architecture/queues/account-lifecycle/README.md).
