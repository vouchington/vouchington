# Account lifecycle worker

Source entrypoint: [backend/workers/account-lifecycle/README.md](../../../../../../backend/workers/account-lifecycle/README.md)

The `accountLifecycle` IO worker dispatches all five account lifecycle job names. It uses concurrency two with scaling ignored, a ten-minute lock duration, and a 30-second stalled interval. It handles bounded account deletion phases and fenced export attempts through one shared queue.

See the [queue contract](../../account-lifecycle/README.md), [export worker behavior](../account-data-requests/README.md), and [deletion worker recovery matrix](../user-deletions/README.md).
