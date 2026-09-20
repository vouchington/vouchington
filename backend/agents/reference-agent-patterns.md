# Agent Patterns

[Back to Agents Architecture](README.md#agent-patterns)

### 1. Single call

One LLM call, no tool loop. Use `createOpenAIResponse` directly, optionally with `parseLLMJsonResponse` for structured JSON.

**Used by:** `moderation`, `story-clustering`, `story-post`

```typescript
import { createOpenAIResponse, parseLLMJsonResponse } from '@agents/_shared'

const response = await createOpenAIResponse({ model, instructions, input })
const text = extractTextFromOpenAIResponse(response)
const parsed = parseLLMJsonResponse<MyType>(text)
```

### 2. `runToolLoop`

Standard iterative tool-calling loop. Handles termination, final fallback call, and observability hooks automatically.

**Used by:** `crm-outreach`, `customer-support`

```typescript
import { runToolLoop, buildAgentTools } from '@agents/_shared'

const { agentTools } = buildAgentTools(currentUser, [searchPostsTool, searchRssFeedItemsTool])
const { text, iterations, terminationReason } = await runToolLoop({
  model,
  instructions,
  tools: agentTools,
  input,
  maxIterations,
  safetyIdentifier: currentUser.id,
})
```

### 3. Subagent tool (`createSubagentTool`)

An orchestrator delegates a complex multi-step task to a specialized inner agent. The subagent runs a full `runToolLoop` internally and returns `{ summary, steps }`.

**Used by:** `research-agent`, `profile-agent`, `discovery-agent` (invoked by the `chat` orchestrator)

```typescript
import { createSubagentTool, type SubagentToolCurryArgs } from '@agents/_shared'

const myAgentTool = createSubagentTool<MyArgs>({
  name: 'run_my_agent',        // must start with run_
  description: '...',
  parameters: { type: 'object', properties: { ... }, required: [...] },
  agentName: 'my',
  systemPrompt: MY_SYSTEM_PROMPT,
  maxIterations: 8,
  toolEntries: [toolA, toolB],
  getInput: async (args) => sanitizeAndWrapUserInput(args.task, 'my_agent_task'),
})

// In the orchestrator:
const subagentCurryArgs: SubagentToolCurryArgs = [
  conversationId, conversationMessageId, agenticRun.id, signal,
]
const { agentTools } = buildAgentTools(currentUser, [
  { tool: myAgentTool, curryArgs: subagentCurryArgs },
])
```

The factory enforces: child agentic run with `parent_agentic_run_id`, real-time `subagent_step` progress events (via async generator executor), signal propagation, and consistent error handling.
Subagent `getInput` builders may be async and must sanitize/wrap any user- or model-provided
delegation text with `sanitizeAndWrapUserInput()` before returning it.

### 4. Manual loop

Use **only** when `runToolLoop` doesn't fit:

- `AsyncGenerator` streaming with yielded events (chat agent)
