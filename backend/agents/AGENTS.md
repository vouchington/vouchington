# LLM agents

- Keep LLM orchestration (`createOpenAIResponse` calls and prompt construction) in `backend/agents/`; services call agents. `agent-response-location` enforces this boundary.
- Select a single call, `runToolLoop`, `runToolLoopStreaming`, or `createSubagentTool` as needed; all `run_*` tools use `createSubagentTool`. Patterns and tool inventory belong in [README.md](README.md).
- Keep system prompts static or trivially computed; fetch user data through tools instead of injecting it into system context.
- Sanitize external RSS/post/crawl content with `sanitizePromptInjection()` and `wrapExternalContent()` before LLM use; follow [backend rules](../AGENTS.md).
- Inject `fetch` into `streamAnthropicChat` only for test isolation. Production requests still pass a dispatcher from `@modules/utils/http-dispatchers`.
- Use [shared helpers](_shared/README.md), [tools](../tools/AGENTS.md), and [agent package inventory](../../docs/overview/architecture/backend/catalogs/README.md#agents) for their owners.
