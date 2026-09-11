# @services/openai-agents

OpenAI Responses API tool-call handling — parses function calls from API output, formats results, and dispatches tool executions.

## Key exports

- `getFunctionCallsFromOutput(output)` — extracts `function_call` items from a Responses API output array
- `formatToolResult(callId, result)` — formats a tool result object for submission back to the Responses API
- `executeToolCalls(params)` — dispatches tool calls in **parallel** via `Promise.all`; use in `runToolLoop` and other non-streaming callers
- `streamingExecuteToolCalls(params)` — dispatches tool calls **sequentially** as an async generator, re-yielding executor events; use in the chat orchestrator to stream subagent progress to the client

## Related

- Parent: [../CLAUDE.md](../CLAUDE.md)
- OpenAI utils module: [../../modules/openai-utils/README.md](../../modules/openai-utils/README.md)
- AI agents system: [../../queues/ai-agents/README.md](../../queues/ai-agents/README.md)
