# API Fixtures

`api-fixtures/v1` is the shared fixture corpus that backend, web, Swift, and .NET tests all read. The checked-in `backendResponseContracts` in its `manifest.json` are explicit data; nothing is inferred from TypeScript handlers (compiler discovery and OpenAPI publication were removed pending contract redesign). The checks therefore do not prove every handler still matches its declared schema; focused handler and tool integration tests must exercise that boundary when a contract changes. See the [Client Parity Matrix](../../../requirements/CLIENT-PARITY-MATRIX.md) for the round-trip invariant enforced on top of this corpus.

Pending adoption metadata lets additive fixture coverage land before native clients register it,
so producer and client PRs need not wait on each other's merge order. It records an adoption gap,
not an exemption from response-contract validation. Breaking changes still need coordinated client
adoption. The [scheduled reconciliation](../../../prompts/scheduled/native-pending-adoption.md)
clears verified adoption metadata and tracks older gaps in the clients repository without deleting
fixtures or introducing a required stale-flag check.

## Update Flow

- Update the handler, the affected explicit contract data, and the fixture case source together. Static example bodies live in `static-response-bodies.json`; files under `api-fixtures/v1/responses` are generated output that CI rejects when stale.
- Run `pnpm run api-fixtures:generate`, commit the manifest, schema lock, and response changes, then run `pnpm run api-fixtures:check` and the focused handler or tool schema tests before pushing. Update `api-contracts` directly when a contract changes (see below), and regenerate affected MCP tool catalogs through the existing catalog tooling.
- Client fixture coverage (`ApiFixtureCoverageTests`) runs from a [vouchington-clients](https://github.com/vouchington/vouchington-clients) checkout after its contract preflight.
- Web consumers bind each generated response to its exact response type and production wrapper invocation in the declarations under `web/test-helpers/api-responses/`; update the matching declaration with the fixture.

## Schema Lock

Each manifest entry's `responseSchema.hash` derives from the response body's structural JSON shape, not fixture values such as ids or timestamps, and `schema-lock.json` records it. Changing example values is free; changing response shape must produce a deliberate schema-lock diff and matching web, Swift, and .NET coverage updates. Web and native cases that exercise the same contract with different request defaults share a `responseSchemaKey`, and the generator fails if they drift to different shapes.

## Lifecycle Scenario Contract

`lifecycle-scenarios.json` is a hand-authored, transport-neutral behavioral contract (not generated) for moderation appeals, integrity reconciliation, cursor races, and private saved-post collections. Its sibling JSON Schema is authoritative. Each scenario has a stable kebab-case id, a code-owned family, and exact required consumers, and claims bind each consumer to one registered executable adapter that receives only the scenario input, so an expected-value change cannot pass by construction. To change one: update manifest and schema together without renaming an id, update every required adapter selected by the family policy, then run the platform contract tests and `pnpm run repo-file-policy`.

## Local-LLM Endpoint Policy Contract

`local-llm-endpoint-policy.json` is a hand-authored corpus pinning the Swift and .NET local-LLM endpoint validators to the same allowed and rejected URLs and canonical origins. `api-fixtures:check` does not read it; `repo-file-policy` validates it against its schema. Update the JSON and schema together without renaming ids, keep `requiredConsumers` nonempty, and do not run `api-fixtures:generate` for it.

## Executable request and query contracts

`api-contracts/v1/request-contracts.json` (workspace `@voucha/api-contracts`) is the checked-in executable request and response bundle. It is a production API contract, not a fixture: runtime request validation and MCP output schemas import it, so it lives outside `api-fixtures` and production code never imports `api-fixtures` (enforced by the dependency-cruiser boundary in `static-code-analysis/production-test-helper-boundary.cjs`). Tests may read it. It is maintained by hand alongside exposed handler contracts. Only `operations` defines request coverage; MCP tools derive output schemas from the same response schemas ([structured tool results](../../../overview/architecture/services/README.md)). Update request bodies, carriers, response components, and affected MCP schemas together. Query schemas describe logical values (bounds, defaults, sentinels, formats, plural aliases) that must match what runtime validation sees, and route tests keep covering normalization, admission order, and invalid input.

Production validates every contracted request through `validateRequestContract` and answers an invalid one with a 422; it has no check that a handler called it. That check cannot prevent anything at runtime, because it could only run after the handler's side effects, so it lives in tests. `backend/test-helpers/api/request-contract-enforcement.mts` wraps every route registered on any test-built app (installed once per project by `vitest.setup.request-contract-enforcement.mts`) and fails the owning test when a contracted, non-exempt route finishes without validating, or validated under another route's `METHOD:path` key. Exemptions (`no-input`, `protocol-parser`, `fixed-status`) live beside it in `request-contract-exemptions.mts`; adding a route without carriers or with a protocol-owned parser needs an entry there.
