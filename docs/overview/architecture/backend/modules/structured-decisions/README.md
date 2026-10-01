# `@modules/structured-decisions`

Source entrypoint: [backend/modules/structured-decisions/README.md](../../../../../../backend/modules/structured-decisions/README.md)

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
`@agents/_shared/structured-decision-billing-hooks.mts`, issue #616). A caller that supplies no
hooks keeps the module's original behavior, including proceeding even when `usage` is absent or
malformed.

## Provider failures

A non-2xx response rejects as a `provider-error` that carries its classification and a bounded
detail, so a caller can tell a retryable failure from one that never succeeds:

- `retryClass` is `transient` (the same request may succeed after a wait) or `permanent`.
  `retryAfterMs` is the provider's `Retry-After`, set only on a transient failure.
- `detail` is read from at most 16 KiB of the OpenRouter error body
  (`{ error: { code, message, metadata } }`): the code, a message cut to 200 characters, and the
  safe metadata keys `error_type`, `provider_code`, `reasons`, `provider_name`, `model_slug` and
  `limit_source`. Codes, types and limit sources are kept only when they are short machine
  identifiers. A moderation block's `flagged_input` is user content and is never kept; any echo of
  it is cut from the message. A guardrail block's `patterns` are only noted as `guardrail: true`.
  An unreadable or non-JSON body leaves no detail and the status alone classifies the failure.
- Retry classification is separate from billing. `isAmbiguousBilledHttpStatus` alone decides the
  `unknown_billed_attempt` spend latch (#652), so a transient 403 does not latch and a permanent 409
  still does.

`retry-classification.mts` holds one table per transport, mapping the status and the parsed body to
a class:

| Transport  | Failure                                                                | Class     |
| ---------- | ---------------------------------------------------------------------- | --------- |
| OpenRouter | connection or transport error                                          | transient |
| OpenRouter | 408, 429, 502, 503, and any other status of 500 or above               | transient |
| OpenRouter | 403 with moderation (`reasons`, `flagged_input`) or guardrail metadata | permanent |
| OpenRouter | any other 403, because an OpenRouter outage can answer 403             | transient |
| OpenRouter | 402 with `limit_source: openrouter_in_flight_budget`                   | transient |
| OpenRouter | 400, 401, any other 402, and any other status                          | permanent |
| TypeSafe   | connection or transport error; 408, 429 and 5xx                        | transient |
| TypeSafe   | every other status (the body is not classified)                        | permanent |

A 403 that is a data-policy, ZDR, allowlist or region guardrail block carries only a message, so it
is indistinguishable from an outage and is retried until the caller's attempt cap ends it.

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

- [Structured decisions architecture](../../../structured-decisions.md)
- [Backend modules](../README.md)
