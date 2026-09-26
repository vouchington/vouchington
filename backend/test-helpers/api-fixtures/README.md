# API Fixtures

This directory is the source for the generated shared API fixture corpus in
`api-fixtures/v1`.

Web consumers bind each generated response to its exact TypeScript response type and production
wrapper invocation through the [web fixture declarations](../../../web/test-helpers/api-responses/README.md#shared-fixture-declarations).

## Real Backend Program Contract Tests

`backend-program.test.mts`, `openapi/write-openapi.test.mts`, `query-contract-registry.hardening.test.mts`,
and `native-moderation-optional-contracts.test.mts` are the only test files that call the real loaders
(`loadBackendProgram()`, `loadBackendResponseContracts()`, `loadBackendRequestContracts()`,
`loadBackendQueryContracts()`, `loadRegisteredRouteCatalog()`) against the actual `backend/tsconfig.json`
route tree, rather than a synthetic `buildVirtualProgramMatrix()`. Building that real `ts.Program` costs
~1.4 GB transient / ~870 MB retained. They run in their own dedicated `backend-contract-program` Vitest
project (`test-helpers/vitest-config/backend-core-projects.mts`), isolated from the rest of
`backend-test-helpers`'s files so this project's peak fork memory depends only on these four files, not on
whatever unrelated test-helper files happen to share a fork with them. They keep `isolate: false` among
themselves — when two of them do land in the same fork, they reuse one memoized program via
`loadBackendProgram()` rather than each building their own — but the repository-owned
`VITEST_MAX_WORKERS` CI worker policy can still give each file its own fork; Vitest 5 has no per-project worker cap that would force
all four onto exactly one. Either way each fork now pays at most one program build, not one build plus
whatever unrelated test-helper files it would otherwise have accumulated.

## Backend Response Contracts

Generic contract-schema extraction, fixture-contract validation, schema-lock hashing, virtual
program matrices, and generated-file IO live in `vouchington-tooling` (`contract-schema` and
`api-fixtures` subpaths). This directory injects Voucha knobs (`ApiUuidContract` /
`ApiArrayContract`, route-shape and status helpers, discriminator keys) and keeps program loaders,
AST registries, fixture cases, and generate CLIs.

Backend TypeScript response expressions are authoritative. During generation,
`response-contract-registry.mts` resolves each fixture's method and route to the corresponding
`ctx.json(...)`, streamed JSON object, 204 response, or explicit `apiResponse(...)` variant. It then
extracts a structural JSON schema from the inferred TypeScript type and validates the fixture in
both directions:

- the fixture method and normalized route shape must match the exact keyed backend emission;
- the fixture status must be one of that exact emission's declared statuses, rather than any status
  documented elsewhere on the same route;
- every required backend field must be present in the fixture;
- every fixture field must be declared by the backend response type;
- optional backend fields are required only when the fixture scenario includes them;
- nullable values, arrays, tuples, unions, intersections, dictionaries, recursive references,
  promises, and `toJSON()` serialization are preserved;
- `unknown` remains an intentionally open boundary, while `any` fails generation.

A `ctx.json(...)` call is attributed to exactly one route by static resolution. When two or more
routes share a helper function that would otherwise contain the discovery-relevant call, keep the
`ctx.json(...)` call at each route's own call site instead, and have the shared helper return the
response body for the route to emit. See `completeMfaVerification` in
`backend/api/v1/sessions-authentication/auth-mfa-routes/complete-mfa-verification.mts` for the
pattern (used because `auth-mfa-totp-verification-post.mts` and
`auth-mfa-passkeys-authentication-verification-post.mts` share it). A call the extractor cannot
attribute to exactly one route is currently skipped rather than rejected (#629); until that
lands, this convention is the only way to keep a shared helper's routes covered by the generated
corpus.

Response metadata belongs to each concrete emission, not to the route as a whole. The extractor
uses the nearest preceding `ctx.setStatus(...)` in the emission's active lexical branch; a dynamic
nearest status makes that operation unavailable. JSON, XML, literal `text/csv` pipelines, and
bodyless responses retain separate media/body contracts. Variants merge only within the same status
and media type, and a failed secondary variant makes the whole operation unavailable rather than
silently disappearing.

The OpenAPI document catalogs every literal API-v1 route registration independently of fixture
coverage. Every registered method and normalized path shape appears in `paths`. SSE handlers are
published as `text/event-stream` with an honest unavailable event-schema marker, unconditional 405
handlers publish only the shared error response, and an otherwise unrecognized emission receives an
operation-level unavailable marker without a fabricated success response.

The default contract key is `METHOD:/route/template`. Use an explicit
`backendResponseContractKey` only when a route has multiple response variants, and wrap that
backend response with the matching `apiResponse('METHOD:/route/template#variant', body)` key.
Route templates must match the actual backend route shape; parameter names may differ because the
registry and fixture validator normalize parameter segments while resolving the binding.

Use `apiNoContent('METHOD:/route/template')` only for fixture-backed bodyless responses. When a
fixed-status bodyless response is emitted inside a helper the extractor cannot follow, use the
OpenAPI-only `apiOpenApiNoContent('METHOD:/route/template', 302)` marker instead. It never changes
runtime status or emits a response, does not create a fixture contract, and requires matching route
and numeric status literals.

`api-fixtures/v1/manifest.json` version 2 publishes each fixture's
`backendResponseContractKey` and the canonical backend schemas and hashes in
`backendResponseContracts`. `schema-lock.json` locks each contract hash together with the fixture
IDs that exercise it. These are build-time checks only and do not alter API wire responses.

See the [Client Parity Matrix](../../../docs/requirements/CLIENT-PARITY-MATRIX.md) for the client
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

See the [static-analysis inventory](../../../static-code-analysis/README.md) for the guard that
applies this schema.

## OpenAPI Query Contracts

`api-fixtures/v1/request-contracts.json` is a generated executable sibling of `openapi.json`.
Both are emitted in one compiler-backed generation and checked together. The TypeScript request
contracts remain authoritative: consumers must not reconstruct runtime validation from OpenAPI.

The generated `api-fixtures/v1/openapi.json` combines response contracts with query parameters from
explicit `apiQuery('METHOD:/route', ...carriers)` markers in backend route handlers. The generator
uses the TypeScript checker to inspect each carrier's typed `queryContract`; it never imports or
executes backend route or parser modules.

Generation fails closed when a marker has a widened or non-literal operation key, is outside its
matching route handler, references a route without a response contract, has no carrier, exposes
widened parameter names, uses an unknown descriptor, appears twice for one operation, or composes
duplicate parameter names. Parsers with `queryContract` metadata are not published unless a route
opts in with a marker.

Schemas describe logical query values rather than every wire-compatible spelling:

- UUID and URI strings keep their OpenAPI formats; UUID-or-URI parameters publish either form.
- Integers publish their configured minimum, maximum, and default.
- Booleans publish `true`/`false`; nullable boolean sentinels also publish the literal string `null`.
- Plural aliases publish one comma-separated value with `style: form` and `explode: false`.
  Singular aliases remain scalar. Runtime support for repeated keys and legacy boolean spellings is
  intentionally not the canonical OpenAPI shape.

Query parameters are optional and sorted by name after route-ordered path parameters. See
[`@modules/pagination`](../../modules/pagination/README.md) for the metadata builders and
[`@services/search-params`](../../services/search-params/README.md) for parser ownership.

## Update Flow

- Edit fixture source in this directory only (for static responses, update
  `static-response-bodies.json`).
- Run `pnpm run api-fixtures:generate`.
- Run `pnpm run openapi:generate` when response or query contracts change.
- Commit the source change, `api-fixtures/v1/manifest.json`, `api-fixtures/v1/schema-lock.json`,
  any generated response JSON changes, and `api-fixtures/v1/openapi.json` when its contract changes.
- `pnpm run api-fixtures:check` is the local no-write convenience check.
- CI regenerates these snapshots and rejects a diff or untracked generated file in
  `checks-static.yml`'s `static-backend` job.
- Run `pnpm run openapi:check` before pushing.
- For client fixture coverage, run
  `swift-clients/tooling/with-build-lock.sh swift test --package-path swift-clients/core --filter ApiFixtureCoverageTests`
  and
  `dotnet-clients/tooling/with-build-lock.sh dotnet test dotnet-clients/Voucha.DotNet.sln --configuration Release --filter FullyQualifiedName~ApiFixtureCoverageTests`.

Run those commands from a [vouchington/vouchington-clients](https://github.com/vouchington/vouchington-clients)
checkout after its Vouchington contract preflight has completed.

Do not edit `api-fixtures/v1/responses/*.json` directly. Those files are generated output. CI
regenerates them and rejects snapshot drift.

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

`cases.mts` attaches `source.caseFile` to every fixture before generation, and
`backendResponseContracts[*].source` is the same file-path-only shape (no line number), so the
manifest is format-stable and generation no longer depends on formatting order. The manifest
metadata is for traceability only; the runtime API and client tests still read the generated
`api-fixtures/v1` corpus.
