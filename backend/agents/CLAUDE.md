# Agents

LLM agents for performing various actions. Agents may use tools from `backend/tools/*`.
Use [README.md](README.md) for commands, architecture diagrams, code examples, and the tool inventory.

## Rules

- **Agent location:** all LLM agent orchestration (functions that call `createOpenAIResponse` or build LLM prompts) must live in `backend/agents/`, not in `backend/services/` or elsewhere. Services may call agents. Enforced by `agent-response-location` static-analysis rule.
- **Pattern selection:** use the simplest pattern that fits — single call, `runToolLoop`, `runToolLoopStreaming`, or `createSubagentTool`. All `run_*` tools must use `createSubagentTool`; automated replacement coverage for this policy is tracked in the static-analysis migration milestone. See [README.md](README.md) for code examples.
- **System prompt design:** minimize initial context — do not inject user data into the system prompt. Use tool calls to fetch data on demand. System prompts must be static strings or trivially computed.
- **Prompt injection prevention:** always sanitize external content (RSS feeds, posts, web crawls) with `sanitizePromptInjection()` before passing to LLMs, and wrap with `wrapExternalContent()`. Never pass raw external content directly to LLM prompts. See [../CLAUDE.md](../CLAUDE.md#rules).
- **External fetch test seams:** `streamAnthropicChat` may accept an injected `fetch` only for test isolation. Production agent request init must still pass a dispatcher from `@modules/utils/http-dispatchers`.

## See Also

- [README.md](README.md) — architecture and patterns
- Shared helpers: [_shared/README.md](_shared/README.md)
- Agent package catalog: [../catalogs/README.md#agents](../catalogs/README.md#agents)
- Tools: [../tools/CLAUDE.md](../tools/CLAUDE.md)
- Backend context: [../CLAUDE.md](../CLAUDE.md)
