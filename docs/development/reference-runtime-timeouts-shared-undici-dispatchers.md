# Shared undici dispatchers

[Back to Runtime Timeouts](runtime-timeouts.md#shared-undici-dispatchers)

`backend/modules/utils/http-dispatchers.mts` is the single seam through which all backend `fetch`
traffic flows (ast-grep-enforced; there is no bare global `fetch` in the backend). Routine external
requests use a 60,000ms `headersTimeout` backstop. OpenAI SDK traffic and direct Anthropic streams
use the explicitly named long-running policy with undici's 300,000ms header allowance because a
non-streaming model response can validly delay its complete response headers while generation runs.

Both policies keep `bodyTimeout` at 300,000ms. This is the maximum delay between body chunks, not a
total request deadline; tightening it would abort sparse LLM streams mid-response. Both agents use
the same connection and keepalive settings, API egress guardrail, graceful-shutdown drain, and test
reset lifecycle. New callers should use the routine policy unless their external protocol can
legitimately delay complete response headers beyond 60 seconds.

The pinned/SSRF-validated dispatcher (`getPinnedRequestDispatcher`, same file) uses
`ssrf-guard@1.0.0`'s bounded pinned-dispatcher cache. Its pinned agents use the routine policy's
five connections, 60,000ms `headersTimeout`, 300,000ms `bodyTimeout`, 4,000ms keepalive,
600,000ms maximum keepalive, and 10,000ms connect timeout. Cache closure is terminal and
idempotent, matching graceful shutdown: the preceding shutdown phase stops accepting work and
drains in-flight requests, so no dispatcher lookup may occur after cache closure.

**Crawler body phase is no longer bounded by the dispatcher's `bodyTimeout`** (#10772):
`backend/modules/utils/http.mts`'s `fetchWithTimeout` used to keep one `AbortSignal.timeout()`
attached from request through body consumption, so the 300,000ms `bodyTimeout` above was the
practical backstop for a slow download once headers arrived. It now clears the request-phase
timer in a `finally` block as soon as `undici.fetch()` settles and arms a fresh, independent
`responseSignal` for the body phase (`DEFAULT_RESPONSE_TIMEOUT_MS`, 5,000ms by default — see
[Classification](reference-runtime-timeouts-classification.md#classification)). Every caller must
thread that `responseSignal` into its body read or it silently reinherits the dispatcher's
300,000ms `bodyTimeout` instead of the intended per-phase budget.
