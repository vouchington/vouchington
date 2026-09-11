# Error Handling

Canonical reference for the error handling system across backend, Cloudflare Worker, and web.
For the CI-main Sentry observability plan used by coding agents, see
[Harness Engineering](../../development/harness-engineering.md). For deployed
CloudWatch and Sentry hunting, see
[Deployed Error Investigation](../../operations/deployed-error-investigation.md).

## Contents

- <a id="error-response-contract"></a>[Error Response Contract](reference-error-handling-error-response-contract.md)
- <a id="error-code-registry"></a>[Error Code Registry](reference-error-handling-error-response-contract.md#error-code-registry)
- <a id="propagation-chain"></a>[Propagation Chain](reference-error-handling-error-response-contract.md#propagation-chain)
- <a id="security-policy"></a>[Security Policy](reference-error-handling-error-response-contract.md#security-policy)
- <a id="how-to-add-a-new-error-code"></a>[How to Add a New Error Code](reference-error-handling-error-response-contract.md#how-to-add-a-new-error-code)
- <a id="using-error-codes-in-the-backend"></a>[Using Error Codes in the Backend](reference-error-handling-error-response-contract.md#using-error-codes-in-the-backend)
- <a id="expected-api-errors-4xx-suppression"></a>[Expected API Errors (4xx Suppression)](reference-error-handling-error-response-contract.md#expected-api-errors-4xx-suppression)
- <a id="server-side-error-boundaries"></a>[Server-Side Error Boundaries](reference-error-handling-server-side-error-boundaries.md)
- <a id="client-side-onerror-weblibon-error"></a>[Client-Side `onError` (`web/lib/on-error/`)](reference-error-handling-client-side-onerror-web-lib-on-error.md)
- <a id="admin-debugging-with-request_id"></a>[Admin Debugging with request_id](reference-error-handling-client-side-onerror-web-lib-on-error.md#admin-debugging-with-request_id)
- <a id="cloudflare-worker-edge-errors"></a>[Cloudflare Worker Edge Errors](reference-error-handling-client-side-onerror-web-lib-on-error.md#cloudflare-worker-edge-errors)
- <a id="crawler-error-auto-disable"></a>[Crawler Error Auto-Disable](reference-error-handling-crawler-error-auto-disable.md)
- <a id="precondition-errors-and-action-oriented-modals"></a>[Precondition Errors and Action-Oriented Modals](reference-error-handling-precondition-errors-and-action-oriented-modals.md)
- <a id="related"></a>[Related](reference-error-handling-precondition-errors-and-action-oriented-modals.md#related)
