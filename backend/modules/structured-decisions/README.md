# `@modules/structured-decisions`

Strict, provider-neutral transport boundary for TypeSafe Jev structured decisions. Callers choose
either the direct TypeSafe System One transport or OpenRouter Decisions explicitly. `decide()` makes
exactly one attempt per call; it never retries and never changes model or transport.

`createStructuredDecisionClient`'s optional `hooks` (`beforeAttempt`, `onBilledResponse`,
`onUnknownBilledAttempt`) are the module's only integration point for billing: `beforeAttempt` runs
immediately before the physical request, `onBilledResponse` fires with the raw `id`/`model`/`usage`
from any 2xx response -- before `decodeResult`'s strict validation, so a 2xx that fails decode still
reports its usage -- and `onUnknownBilledAttempt` fires when a network error, an ambiguous HTTP
status (408/409/429/5xx), or unreadable usage on a 2xx makes it impossible to know whether the
provider billed the request. This module never imports `@services/ai-usage` itself; callers wire
these hooks to the ledger and spend cap at the agent layer (e.g.
`@agents/autotagger/structured-decision-attempt-hooks.mts`, issue #616). A caller that supplies no
hooks keeps the module's original behavior, including proceeding even when `usage` is absent or
malformed.

The module validates request identity and every returned primitive before exposing it. Noul returns a
probability only; Choice and Score retain their native confidence and per-criterion probabilities.
Malformed, partial, duplicate, or non-normalized responses reject as a whole. Raw provider JSON is
retained alongside the normalized result for later audit persistence. Each normalized answer also
retains its own validated native provider fragment. Fragments remain exactly as returned; when the
provider keys answers by question ID outside the fragment, the decoder does not synthesize an ID
inside it.

The deterministic suite mocks only the provider edge. The one native OpenRouter contract test lives
in the separate `backend-openrouter` Vitest project and requires `OPENROUTER_API_KEY`; it never skips
when explicitly invoked.

`benchmark.mts` is an opt-in, credentialed operator tool. It exercises the six real LLM-backed
moderation prompts and a bounded sweep of realistically sized dynamic candidates. All provider and
comparator rates, cache-hit assumptions, and output/reasoning token assumptions must be supplied
through the `STRUCTURED_DECISIONS_*` environment variables named in `benchmark-config.mts`; no
pricing is committed to the repository. The JSON output path is also explicit, and the file is
created with mode `0600`. The artifact records within-size and across-size anchor drift, usage,
latency, modeled current cost, and Jev cost. Keep that artifact outside the repository.

## Related

- [Structured decisions architecture](../../../docs/overview/architecture/structured-decisions.md)
- [Backend modules](../README.md)
