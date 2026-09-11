# Analytics Data Store

Analytics data-store adapter used for local, disabled, and fallback analytics query/emit flows.

## Files

- `emit.mts` - event emission entry point.
- `query.mts` - analytics query entry point.
- `backend-local.mts` - local JSONL runtime backend implementation.

## Runtime Modes

| `ANALYTICS_BACKEND`  | Behavior                                                                              |
| -------------------- | ------------------------------------------------------------------------------------- |
| `disabled` (default) | Writes are no-ops.                                                                    |
| `local`              | Appends partitioned JSONL under `ANALYTICS_LOCAL_DIR` (default `./tmp/analytics`).    |
| `firehose`           | Buffers records and sends `PutRecordBatch` to `${ANALYTICS_FIREHOSE_PREFIX}${table}`. |

Both buffered backends serialize concurrent `flush()` calls and drain records accepted during an
active flush before the original flush promise resolves. Callers may therefore await `flush()`
before querying local analytics or completing graceful shutdown.

Prefer typed emitters from [`@services/analytics`](../../services/analytics/README.md). The data
store self-registers graceful shutdown, and the shared retention job removes expired local JSONL.
Retention scans partitions and rows sequentially, compacting through a private sibling temporary
file before an atomic rename; the sibling location is intentional because `rename` is atomic only
within one filesystem. It does not load JSONL partitions into process memory.

## Related

- Data stores overview: [../README.md](../README.md)
- Local rules: [CLAUDE.md](CLAUDE.md)
