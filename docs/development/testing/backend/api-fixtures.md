# API Fixtures

Source entrypoint: [backend/test-helpers/api-fixtures/README.md](../../../../backend/test-helpers/api-fixtures/README.md)

This directory is the source for the generated shared API fixture corpus in
`api-fixtures/v1`.

Web consumers bind each generated response to its exact TypeScript response type and production
wrapper invocation through the [web fixture declarations](../web/api-responses.md#shared-fixture-declarations).

## Contract Data and Artifact Assertions

The checked-in `backendResponseContracts` in `api-fixtures/v1/manifest.json` are the explicit
response contract data. Fixture cases remain the source for generated example bodies and their
metadata. `pnpm run api-fixtures:check` validates those cases against the declared contracts and
checks the manifest, schema lock, and response snapshots without discovering backend routes.
`pnpm run backend-row-contracts:check` independently verifies PostgreSQL producer row types.
The row check uses the shared compiler cache with local root selection; see
[compiler-backed contract tests](../../reference-tests-parallel-safety-and-test-root-hygiene.md#compiler-backed-contract-tests)
for its freshness and test boundary.

Compiler-based API contract discovery and OpenAPI publication are removed pending contract
redesign. Current request, response, and MCP schema payloads are preserved. These checks do not
prove that every backend handler still matches its declared schema; focused handler and tool
integration tests must exercise that boundary when a contract changes.

## Backend Response Contracts

Fixture-contract validation, schema-lock hashing, and generated-file IO remain upstream in
`vouchington-tooling/api-fixtures`. This directory owns fixture cases, explicit response contract
data, and the fixture generation CLI. It does not infer API contracts from TypeScript handlers.

Update an affected response contract together with its handler, fixture cases, and consumers.
Fixture validation checks the keyed route and status, required fields, rejected extra fields,
nullable values, and the recorded structural schema. Preserve exact variants and raw-body contracts.
A fixture must use its declared `backendResponseContractKey`; route parameter spelling is normalized
when matching route shapes.

`api-fixtures/v1/manifest.json` version 2 publishes those contracts and their fixture bindings.
`schema-lock.json` locks each contract hash together with the fixture IDs that exercise it.
These checks do not alter API wire responses. SSE and HTTP helpers retain their runtime behavior;
there is no compiler-discovery acceptance gate.

See the [Client Parity Matrix](../../../requirements/CLIENT-PARITY-MATRIX.md) for the client
round-trip invariant enforced on top of this corpus.

## Local-LLM Endpoint Policy Contract

`api-fixtures/v1/local-llm-endpoint-policy.json` is a hand-authored native cleartext and origin
contract. Unlike the generated response corpus, it pins Swift and .NET local-LLM endpoint
validators to the same allowed/rejected URLs and canonical Origin strings. Its sibling
`local-llm-endpoint-policy.schema.json` is authoritative. Native test suites walk up from the
test file to the committed corpus path; there is no Node consumer today.

HTTP is allowed only for loopback, RFC 1918, IPv4/IPv6 link-local, IPv6 ULA, `localhost`, ASCII
`.local`, and single-label LAN names. RFC 6598 `100.64.0.0/10` is rejected on HTTP (#9474). HTTPS
is allowed for any host, including a CGNAT literal. See
[Native client architecture](https://github.com/vouchington/vouchington-clients/blob/main/docs/architecture/native-clients.md)
for the product wording.

To add or change a row: update the JSON and schema together, keep kebab-case IDs aligned with the
verdict, add every required consumer that should execute the row (`dotnet-core`, `swift-core`,
and `swift-android` only when Android should cover that case), and run the focused
`LocalLLMEndpointProfileTests` / `LocalLLMSettingsTests` contract suites. Do not run
`api-fixtures:generate`; this file is not part of the generated response lock.

## Lifecycle Scenario Contract

`api-fixtures/v1/lifecycle-scenarios.json` is a hand-authored, transport-neutral behavioral
contract. Unlike the generated response corpus, it describes lifecycle inputs and normalized
observations for moderation appeals, integrity reconciliation, cursor races, and private saved-post
collections. Its sibling JSON Schema is authoritative.

Node consumers import this manifest through the private `@voucha/api-fixtures` workspace export;
client test suites continue to read the committed corpus path directly.

Every scenario has a stable kebab-case ID, a code-owned family, exact required consumers, input
preconditions/action/server outcome, and expected visible state/actions/reconciliation/cancellation.
Claims bind each required consumer to one registered executable adapter. Adapters receive only the
scenario input; the platform runner compares their normalized observation with `expected`, so an
expected-value change cannot pass by construction.

To add or change a scenario:

1. Update the manifest and schema together without renaming an existing ID.
2. Update every required backend, web, Swift, or .NET adapter selected by the family policy.
3. Run the focused platform contract tests and `pnpm run repo-file-policy`.
4. For private saved-post browser behavior, also run the claimed Playwright spec.

The repository guard rejects schema errors, duplicate IDs, consumer-policy drift, missing or
duplicate claims, incompatible/unknown adapters, nonexistent claims, and adapter evidence that
does not both consume the manifest and dispatch the registered adapter name.

## Local LLM Endpoint Policy Contract

`api-fixtures/v1/local-llm-endpoint-policy.json` is a hand-authored, transport-neutral corpus of
cleartext-host and origin-canonicalization cases for the native local-LLM clients. Unlike the
generated response corpus, `pnpm run api-fixtures:check` does not read or rewrite this file. Its
sibling JSON Schema is authoritative.

Native test loaders in .NET Core, Swift core, and Swift Android read the committed path directly.
The schema `$defs.consumer` enum is the source of truth for those handwritten consumer sets.

To add or change a row:

1. Update the corpus and schema together without renaming an existing ID.
2. Keep `requiredConsumers` nonempty and limited to `dotnet-core`, `swift-core`, and `swift-android`.
3. Run `pnpm run repo-file-policy`. Do not use `api-fixtures:check` as coverage for this file.

The repository guard rejects schema errors, empty `requiredConsumers`, unknown consumers or
verdicts, duplicate IDs across `hostPolicyRows` and `originPairs`, and loader consumer enums that
do not exactly match `$defs.consumer`. It does not change RFC 6598 / CGNAT rows or expand the
corpus; those belong on the CGNAT follow-up, not this contract.

See the [static-analysis inventory](../../quality/static-code-analysis/README.md) for the guard that
applies this schema.

## Executable Request and Query Contracts

`api-fixtures/v1/request-contracts.json` is the checked-in executable request and response bundle.
Maintain it explicitly alongside exposed handler contracts. The compiler-discovery generator,
its snapshot check, the internal OpenAPI builder, and public OpenAPI/Redoc publication are removed.

Only `operations` defines request coverage. The sibling `responses` map holds named 200 JSON
response schemas and reuses `components`. MCP tools derive output schemas through
`backend/mcp/route-response-schema.mts`; see
[Structured tool results](../../../overview/architecture/services/mcp-tools/README.md#structured-tool-results).
The sibling `adminResponses` map preserves the 87 staff inline and non-200 fallback schemas
previously consumed from OpenAPI. Runtime request validation and MCP output validation retain
these same schema payloads and one reader.

Update request bodies, path/header/query carriers, response components, and affected MCP schemas
together. Route parser metadata does not regenerate this bundle. Query schemas describe logical
values: integer bounds/defaults, boolean and nullable sentinels, UUID/URI formats, and comma-separated
plural aliases must still match the settled values passed to runtime validation. Keep focused route
tests for normalization, admission order, invalid input, and rejected execution.

## Update Flow

- Update the handler, affected explicit contract data, and fixture case source together.
  For static example responses, update `static-response-bodies.json`.
- Run `pnpm run api-fixtures:generate` and commit the manifest, schema lock, and response changes.
- Update `api-fixtures/v1/request-contracts.json` directly when its contract changes; update
  affected MCP tool schemas and regenerate their catalog through the existing catalog tooling.
- Run `pnpm run api-fixtures:check` and the focused handler/tool schema tests before pushing.
  CI checks fixture snapshots independently from `pnpm run backend-row-contracts:check`.
- For client fixture coverage, run
  `swift-clients/tooling/with-build-lock.sh swift test --package-path swift-clients/core --filter ApiFixtureCoverageTests`
  and
  `dotnet-clients/tooling/with-build-lock.sh dotnet test dotnet-clients/Voucha.DotNet.sln --configuration Release --filter FullyQualifiedName~ApiFixtureCoverageTests`.

Run those native commands from a
[vouchington/vouchington-clients](https://github.com/vouchington/vouchington-clients) checkout after
its Vouchington contract preflight has completed.

Response example files in `api-fixtures/v1/responses` remain generated output. Edit their case
producers and regenerate them; CI rejects snapshot drift.

## Schema Lock

Each manifest entry includes `responseSchema.key` and `responseSchema.hash`. The hash is derived from
the response body's structural JSON shape, not fixture values such as IDs or timestamps.
`api-fixtures/v1/schema-lock.json` records those hashes.

Changing example values is allowed when it improves coverage. Changing response shape must create a
deliberate schema-lock diff and matching web, Swift, and .NET fixture coverage updates.

When web and native clients exercise the same API response contract with different request defaults,
give their cases the same `responseSchemaKey`. The generator fails if cases with the same key drift
to different response shapes.

## Source Metadata

The native tags/bookmarks, Swift, community, and community-moderation case modules compose
ordered arrays from focused domain case files. Their composition order is part of the generated
corpus contract; `cases.mts` retains the composition module as each fixture's provenance owner.
Extracting a domain file must preserve this order and run `api-fixtures:check` to verify payloads,
schema locks, and source metadata together.

`cases.mts` attaches `source.caseFile` to every fixture before generation, and
`backendResponseContracts[*].source` is the same file-path-only shape (no line number), so the
manifest is format-stable and generation no longer depends on formatting order. The manifest
metadata is for traceability only; the runtime API and client tests still read the generated
`api-fixtures/v1` corpus.
