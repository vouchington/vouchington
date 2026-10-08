# Agent Patterns

[Back to Agents Architecture](../../../../backend/agents/README.md#agent-patterns)

### 1. Single call

One schema-constrained provider call through
[`@modules/model-providers`](../backend/modules/model-providers/README.md). The agent entry point
takes the `{ provider, model }` its service setting holds, builds a `generateJson` request
(instructions, input, JSON schema, a `parse`), and settles the usage ledger with `callAgentModel`.
A provider SDK never appears in an agent, and an agent has no hidden default model.

**Used by:** `report-judgement`, `appeal-resolution`, `dispute-resolution`, `story-post`,
`conversation-title`, `copyright-email-intake`, `copyright-form-screening`,
`copyright-submission-guidance`, `copyright-appeal-recommendation`

```typescript
import { callAgentModel, type AgentModelCaller } from '@agents/_shared'
import { generateJson } from '@modules/model-providers/generate'

// model.mts: the seam tests replace.
export const callMyModel: AgentModelCaller<MyOutput> = (
  input,
  safetyIdentifier,
  { selection, openaiTransport },
) =>
  generateJson(
    selection,
    { instructions, input, schemaName: 'my_output', schema, parse, maxOutputTokens: 1_000 },
    { openaiTransport },
  )

// run.mts: the entry point is (input, selection, callModel = callMyModel).
const { output, model } = await callAgentModel({
  agentSlug: 'my-agent',
  selection,
  input,
  safetyIdentifier,
  callModel,
})
```
