# Exports

[Back to @agents/\_shared](../../../../../backend/agents/_shared/README.md#exports)

### `callAgentModel(params)`

Calls an agent's model caller on the provider its caller selected and settles the usage ledger for
the result. `params` is `{ agentSlug, selection, input, safetyIdentifier, callModel, communityId?, postId? }`;
`selection` is the `{ provider, model }` the service's `ai-model-routing` setting holds, passed down
by the worker or request handler. The global OpenAI transport is resolved here, once per call, and
handed to `callModel` as `{ selection, openaiTransport }`; it is never part of an entry point's
options.

```typescript
import { callAgentModel, type AgentModelCaller } from '@agents/_shared'

const { output, model } = await callAgentModel({
  agentSlug: 'my-agent',
  selection,
  input: userInput,
  safetyIdentifier: userId,
  callModel: callMyModel satisfies AgentModelCaller<MyOutput>,
})
```

A model caller wraps `generateJson` from
[`@modules/model-providers`](../../backend/modules/model-providers/README.md). Its request carries
the retry budget: pick `maxRetries` from `backend/agents/_shared/retry-policy.mts` matching the
workload, `SYNCHRONOUS_REQUEST_RETRY_POLICY` (1) or `QUEUED_BACKGROUND_RETRY_POLICY` (2), rather
than leaving the OpenAI free-capacity budget implicit. The provider boundary always sends
`maxRetries: 0` to the SDK and treats the value as an application-owned budget for the
known-unbilled flex `resource_unavailable` 429. Ambiguous potentially billed failures latch the
request day and stop. Once that budget is spent, or flex capacity is reported as a streamed
failure, a flex request is resent once on the default tier. Anthropic calls make one request: a
retry belongs to the queue, which rechecks the spend cap first. The full retry-budget table and
its accounting contract live in the private `vouchington/vouchington-docs` repository.

Keep trusted `instructions` separate from message `input`.

Usage-recording and token-accounting (`runWithJobTokenAccumulator`, `recordAgentResponseUsage`, and
the `recordModelUsage` and `callRecordingModelUsage` boundaries under `callAgentModel`) are
documented in [Usage Tracking](reference-usage-tracking.md).
