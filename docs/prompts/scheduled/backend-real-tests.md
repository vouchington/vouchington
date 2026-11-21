Review backend tests for internal mocking that can be replaced with real dependencies. Pick at most one concrete, bounded improvement that is safe to ship in one PR.

- Load `vouchington-backend-tests` and read [backend conventions](../../../backend/AGENTS.md). Inspect `*.mock.test.mts`, `vi.mock`, `vi.spyOn`, and injected `vi.fn` collaborators; choose one coherent cluster.
- Replace internal enqueue, publish, transaction, query, service, and processor spies with assertions on persisted state, queued jobs, emitted messages, or results. Keep tagged external-provider mocks and focused fault, time, environment, or console seams where real behavior is unsafe or nondeterministic.
- The in-memory GlideMQ shim does not enforce wall-clock delay, deduplication, ordering, or Valkey semantics; do not present it as a real Valkey integration test.
- Follow the [Vitest mock policy](../../development/reference-tests-vitest-mock-typing.md) for filenames. Preserve coverage and include coverage evidence in the PR.
