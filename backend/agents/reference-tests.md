# Tests

[Back to Agents Architecture](README.md#tests)

Run a specific agent's local tests with:

```bash
pnpm exec vitest run --project backend-data-stores --project backend-mocks backend/agents/<agent-name>/
```

Run its credentialed OpenAI tests only when `OPENAI_API_KEY` is available:

```bash
pnpm exec vitest run --project backend-openai backend/agents/<agent-name>/
```
