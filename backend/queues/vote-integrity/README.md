# Vote Integrity System

Job queue for detecting and flagging suspicious voting patterns such as velocity spikes and IP-correlated voting rings.

## Processors

| Processor                 | Type   | Priority | Description                                                                         |
| ------------------------- | ------ | -------- | ----------------------------------------------------------------------------------- |
| processVoteIntegrityCheck | worker | 10       | Checks for velocity spike and IP correlation; creates flags when thresholds are met |

## Deduplication

- Per-entity integrity check: debounce 30s TTL on `processVoteIntegrityCheck__{entityType}__{entityId}`

## Related

- Service: [../../services/vote-integrity/](../../services/vote-integrity/README.md)
- Worker entry: [../../entrypoints/worker-io/README.md](../../entrypoints/worker-io/README.md)
