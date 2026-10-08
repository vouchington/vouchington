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

### `callAgentToolTurn(params)`

The tool-using counterpart of `callAgentModel`: one turn of a tool-using agent through
`generateToolTurn`, with the same ledger settlement. `params` is `{ request, agentSlug, selection,
classifierRunId?, beforeDispatch?, callTurn?, communityId?, postId? }`. The daily spend cap is
checked before every turn; `beforeDispatch` runs after the cap admitted the turn and before it is
sent (the C7 autotagger reserves its provider attempt there on the first turn only); a billed turn
is recorded against `classifierRunId`, and a billed turn that is unusable (a refusal, a cut-off or
malformed tool call) is recorded too. The agent owns the loop and its bounds.

Usage-recording and token-accounting (`runWithJobTokenAccumulator`, `recordAgentResponseUsage`, and
the `recordModelUsage` and `callRecordingModelUsage` boundaries under `callAgentModel`) are
documented in [Usage Tracking](reference-usage-tracking.md).
