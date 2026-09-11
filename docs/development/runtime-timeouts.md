# Runtime Timeouts

A registry of every runtime application timeout — server, worker, HTTP dispatcher, Lambda, and
SSE/long-lived connection — classified by why the value is what it is, so a future change knows
whether it's touching a protocol constraint, a tunable knob, or a crash-recovery window. Written
for issue #8106 (child of #8107, sibling of #8078 which covered CI/harness timeouts —
this doc is scoped to **runtime** timeouts only).

## Contents

- <a id="principle-sse--long-lived-connection-duration-under-fargate-spot"></a>[Principle: SSE / long-lived connection duration under Fargate Spot](reference-runtime-timeouts-principle-sse-long-lived-connection-duration-under-fargate-spot.md)
- <a id="classification"></a>[Classification](reference-runtime-timeouts-classification.md)
- <a id="tunable-performance-knobs"></a>[Tunable performance knobs](reference-runtime-timeouts-tunable-knobs.md)
- <a id="crash-recovery--stall-windows-not-runtime-caps--do-not-lower"></a>[Crash-recovery / stall windows](reference-runtime-timeouts-crash-recovery.md)
- <a id="vendored-do-not-modify"></a>[Vendored](reference-runtime-timeouts-vendored.md)
- <a id="infra"></a>[Infra](reference-runtime-timeouts-infra.md)
- <a id="shared-undici-dispatchers"></a>[Shared undici dispatchers](reference-runtime-timeouts-shared-undici-dispatchers.md)
- <a id="node-http-server"></a>[Node HTTP server](reference-runtime-timeouts-node-http-server.md)
- <a id="sse-compliance-status"></a>[SSE compliance status](reference-runtime-timeouts-sse-compliance-status.md)
- <a id="cross-tier-observation"></a>[Cross-tier observation](reference-runtime-timeouts-cross-tier-observation.md)
- <a id="regression-coverage"></a>[Regression coverage](reference-runtime-timeouts-regression-coverage.md)
- <a id="follow-ups"></a>[Follow-ups](reference-runtime-timeouts-follow-ups.md)
- <a id="related"></a>[Related](reference-runtime-timeouts-related.md)
