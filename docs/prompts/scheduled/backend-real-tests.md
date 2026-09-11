Review backend tests for internal mocking that can be replaced with real dependencies. Pick exactly one concrete, bounded improvement that is safe to ship in one PR.

- Start with the [backend](../../../backend/CLAUDE.md), [service](../../../backend/services/CLAUDE.md), [queue](../../../backend/queues/CLAUDE.md), [flow](../../../backend/flows/CLAUDE.md), and [worker](../../../backend/workers/CLAUDE.md) conventions plus the [Vitest mock policy](../../development/tests.md#vitest-mock-typing). Follow the nearest `CLAUDE.md` ownership boundary, especially the rule to test service behavior behind processors.
- Inspect `*.mock.test.mts` files and uses of `vi.mock`, `vi.spyOn`, and injected `vi.fn` collaborators. Choose one coherent test cluster where replacing internal seams improves confidence.
- Prioritize real service, PostgreSQL, and Valkey behavior; replace internal enqueue, publish, transaction, query, service, or processor-dependency spies with assertions on persisted state, queued jobs, emitted messages, or returned results. Deterministic local libraries and filesystem dependencies are also good candidates when safe.
- Backend Vitest aliases GlideMQ to an in-memory shim that does not enforce wall-clock delay, deduplication, ordering, or real Valkey semantics. Use it for observable processor and data-flow behavior, assert production queue options directly, and do not present shim behavior as a real Valkey integration test.
- Preserve tagged external-provider and network mocks. Also preserve focused fault injection and time, environment, or console seams when the real behavior would be unsafe, nondeterministic, credentialed, or impractical to reproduce.
- Reuse existing test helpers, generate randomized fixture IDs, and keep tests idempotent on dirty databases. Avoid partial internal mocks and mock-only helper barrels.
- Skip work already covered by an active PR. Preserve or increase coverage, run the owning focused test repeatedly, and include the relevant coverage evidence in the PR.
- Rename a `.mock.test.mts` file only after removing every filename-triggering API listed in the Vitest mock policy, including `vi.stubEnv`, module mock APIs, `vi.spyOn`, and Jest mock APIs. An injected `vi.fn` alone does not require the `.mock.test.mts` suffix.

Prepare and validate one bounded workspace patch, then publish it as the draft PR.
