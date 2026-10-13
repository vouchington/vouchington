# OpenRouter utilities

Source entrypoint: [backend/modules/openrouter-utils/README.md](../../../../../../backend/modules/openrouter-utils/README.md)

This module sends retained agent calls to OpenRouter’s OpenResponses endpoint. It uses foreground streaming and preserves the terminal response model, token usage, and provider-reported billed cost for the shared usage ledger. It intentionally does not use the direct OpenAI background-response registry.

`OPENROUTER_API_KEY` is required only when an OpenRouter-backed agent or its credentialed test runs.

Recorded OpenRouter responses (`backend/test-helpers/provider-fixtures/openrouter/`) replay through the real SDK in `create-response.replay.no-data.mock.test.mts`, which gates the request we send, the parsed terminal response and billed `cost`, and the latch-and-stop policy for a create-time 5xx and a pre-delta stream error. The credentialed `create-response.openrouter.test.mts` is a non-gating smoke check of the live endpoint.
