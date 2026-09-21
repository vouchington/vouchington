# OpenRouter utilities

This module sends retained agent calls to OpenRouter’s OpenResponses endpoint. It uses foreground streaming and preserves the terminal response model, token usage, and provider-reported billed cost for the shared usage ledger. It intentionally does not use the direct OpenAI background-response registry.

`OPENROUTER_API_KEY` is required only when an OpenRouter-backed agent or its credentialed test runs.
