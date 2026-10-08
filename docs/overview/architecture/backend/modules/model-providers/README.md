# @modules/model-providers

Source entrypoint: [backend/modules/model-providers/README.md](../../../../../../backend/modules/model-providers/README.md)

The provider layer for model-backed agents (issue #2370). Every agent calls a model as
`generateJson({ provider, model }, request, options)` and gets the same result shape back, whichever
provider served it. No provider SDK appears outside this layer and the two OpenAI-compatible
transports it wraps (`@modules/openai-utils`, `@modules/openrouter-utils`); the
`model-provider-sdk-location` ast-grep rule enforces it.

## Providers and transports

- **Anthropic** (`claude-haiku-5-5`, the default) is called directly through `@anthropic-ai/sdk`, the
  Claude API client, never the Agent SDK. The client takes `ANTHROPIC_API_KEY` (ECS, local) or, when
  that is unset, `ANTHROPIC_AUTH_TOKEN` (CI's federated token). Neither set is a permanent
  `client-unavailable` `ModelProviderError`, never a crash or an endless requeue, and boot does not
  require the key. The SDK's own retries are off. Anthropic uses the same long-running fetch as
  OpenAI and OpenRouter; Node's default happy-eyeballs stays on because API tasks reach
  `api.anthropic.com` over IPv6 only.
- **OpenAI** (`gpt-6-luna`) goes through OpenRouter or OpenAI directly. One global setting,
  `ai-model-routing.openai_transport`, picks it (default `openrouter`); it is not part of any
  caller's options. Direct keeps background mode, its registry and reconciler, and the flex
  fallback.

## One call, one result

`generateJson` sends a JSON-schema-constrained request (`output_config.format` on Anthropic, the
Responses `json_schema` format on OpenAI), then validates the answer against the same schema with
Ajv and narrows it with the caller's `parse`. It returns the output, the model actually served, the
response id, the served service tier and provider-neutral `ModelUsage`.

- A model that rejects a parameter fails before any request: Haiku 5.5 returns a 400 for any
  non-default `temperature`, `top_p` or `top_k`, so the layer throws `unsupported-parameter` and never
  sends them. An unpriced model is rejected too.
- A 2xx answer that is a refusal, truncated or schema-invalid still billed. The thrown
  `ModelProviderError` carries `billedResponse`, so the ledger still records it.
- Failures map onto one classification. Anthropic 408, 429, 529 (overloaded) and 5xx, and a dropped
  connection, are `transient` (honouring `retry-after`); other 4xx are `permanent`. "Credit balance
  too low" is permanent with its own `credit-balance-too-low` code so the alarm can name it.
  `ambiguousBilled` marks a failure after the request was sent, which callers record as an unknown
  billed attempt.

## Tool-using agents

`generateToolTurn(selection, request, options)` is one turn of a tool-using agent on either provider.
The transcript is provider-neutral (`AgentTurnMessage`: user text, assistant text with tool calls,
tool results); each provider adapter turns it into Messages or Responses items. A tool call is
required every turn (`tool_choice: any` on Anthropic, `required` on OpenAI), so an agent's answer is
always a tool call it can validate, never free text. A refusal, a turn cut off at `max_tokens` or a
turn with no usable tool call is a permanent `ModelProviderError` carrying its billed response, like
`generateJson`. The loop, its bounds and the per-turn ledger rows belong to the agent
(`@agents/_shared`'s `callAgentToolTurn` settles each turn); the C7 autotagger is the one consumer.

## Pricing

`pricing-table.mts` is the provider-neutral price table (it replaced `@modules/openai-utils/pricing`),
with each row's source and retrieval date in its header comment. The price band is chosen by the
whole prompt (uncached input, cache writes and cache reads together) and prices the output too:
Haiku 5.5 steps up above 100k tokens, Luna above 272k. A served model or tier without a row is
recorded unpriced, which the daily spend cap treats as a breach; the ledger records list price and
ignores whether prepaid credits paid for the call.

## Per-service settings

`MODEL_SERVICE_SLUGS` lists every model-backed service (its ledger `agent_slug`). The
`ai-model-routing` dynamic config holds `<slug>_provider` and `<slug>_model` for each, plus
`openai_transport`. Saving rejects an unknown provider, a model of the other provider and an unpriced
model. Only the `developer` role can update it. There is no automatic fallback between providers:
when Anthropic's included credits run out, switch the affected services to `openai` in the setting.
