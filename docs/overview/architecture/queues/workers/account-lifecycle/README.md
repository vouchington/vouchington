# Account lifecycle worker

Source entrypoint: [backend/workers/account-lifecycle/README.md](../../../../../../backend/workers/account-lifecycle/README.md)

`@workers/account-lifecycle` has no worker of its own: `accountLifecycleHandlers` registers the five account lifecycle job names with the shared [background worker](../background/README.md), which serves them under the domain-wide group of two (baseline concurrency two) and honors the domain's pause switch. Each job carries a ten-minute per-job lock duration. It handles bounded account deletion phases and fenced export attempts.

See the [queue contract](../../account-lifecycle/README.md), [export worker behavior](../account-data-requests/README.md), and [deletion worker recovery matrix](../user-deletions/README.md).
