Review API performance. Pick at most one concrete, bounded improvement that is safe to ship in one PR.

- Check one backend API surface against [API Performance Requirements](../../requirements/platform/api-performance.md): N+1 hydration, sequential awaits, missing `*Batch()`/`*CachedBatch()` use, public logged-out GETs missing cache behavior.
- Keep authorization, personalized fields, and freshness semantics unchanged unless the fix targets them.
- Add or tighten targeted tests for the selected endpoint or guardrail.
