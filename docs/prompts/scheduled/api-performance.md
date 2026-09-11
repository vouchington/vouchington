Review API performance. Pick exactly one concrete, bounded improvement that is safe to ship in one PR.

- Check one backend API surface against [API Performance Requirements](../../../docs/requirements/platform/api-performance.md), including round-trip budget, batching, caching, and README performance docs.
- Look for N+1 hydration, unnecessary sequential awaits, missing `*Batch()`/`*CachedBatch()` usage, or public logged-out GETs missing appropriate cache behavior.
- For an awaited loop, prefer a set-based or provider/queue bulk operation first, then bounded concurrency for independent local work. Retain a statement-local suppression only for dependent retry, cursor, transaction, stream, or backpressure flows, and state that invariant in the directive.
- Keep authorization, personalized fields, and freshness semantics unchanged unless the selected fix explicitly targets them.
- Skip findings already covered by open issues or open PRs.
- Add or tighten targeted tests for the selected endpoint or guardrail.
