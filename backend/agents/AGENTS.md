# LLM agents

- Keep LLM orchestration (`generateJson` calls and prompt construction) in `backend/agents/`; services call agents. `agent-response-location` enforces this boundary.
- Make one structured-decision or single-response call per decision; every entry point takes the `{ provider, model }` its service setting holds and has no default model. A provider SDK is imported only by `@modules/model-providers`. Patterns and tool inventory belong in [README.md](README.md).
- Keep system prompts static or trivially computed; fetch user data through tools instead of injecting it into system context.
- Sanitize external RSS/post/crawl content with `sanitizePromptInjection()` and `wrapExternalContent()` before LLM use; follow [backend rules](../AGENTS.md).
- Use [shared helpers](_shared/README.md), [tools](../mcp/AGENTS.md), and [agent package inventory](../../docs/overview/architecture/backend/catalogs/README.md#agents) for their owners.
