# How to Add a New Subagent

[Back to Agents Architecture](README.md#how-to-add-a-new-subagent)

1. Create `backend/agents/<name>-agent/` directory
2. Add `package.json` with workspace name `@agents/<name>-agent`, deps on `@agents/_shared` and `@voucha/tools`
3. Write `build-system-prompt.mts` — export a `<NAME>_SYSTEM_PROMPT` string constant
4. Write `tool.mts` — use `createSubagentTool<Args>()` from `@agents/_shared`
5. Write `index.mts` — barrel re-export: `export { myAgentTool } from './tool.mts'`
6. Write `tool.mock.test.mts` — mock `createOpenAIResponse`, test schema name and child agentic run creation
7. Add the workspace to `pnpm-workspace.yaml` and `backend/package.json` workspaces; `pnpm run no-mistakes` validates the exact nested workspace entries
8. Register in [`backend/agents/chat/stream.mts`](chat/stream.mts) — add to `buildAgentTools()`
9. Add delegation rule to [`backend/agents/chat/build-system-prompt.mts`](chat/build-system-prompt.mts)
10. Update [`backend/agents/CLAUDE.md`](CLAUDE.md) — add to Related section
11. Update [`backend/agents/_shared/README.md`](_shared/README.md) — add to "Used by"
