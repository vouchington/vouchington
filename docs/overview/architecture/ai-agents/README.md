# AI Agent Architecture

Agent packages live in `backend/agents/`; read the package for its contract. The
[AI platform overview](../ai-platform.md) owns shared classifier invariants, the provider boundary
and measurement, and [AI agents](../ai-agents.md) links the surrounding pipelines.

- Pick the simplest pattern that fits. Most agents are a single schema-constrained call through the
  model-provider layer; no provider SDK appears in an agent and no agent has a hidden default model.
- There is no shared tool loop. The one tool-using agent owns its bounded loop, and a decision that
  scores content belongs in a classifier instead.
- Agent output is advisory. Drafts for disputes, appeals, reports and copyright intake never change
  state or reach a user without human approval.
- Tools exposed to agents wrap existing services and are registered in the MCP catalog; no new
  business logic lives in a tool.
- Sanitize external content before it reaches an agent.
- Duplicate delivery is prevented by cheap start-of-job reads of the domain row on the primary
  database, not by a billing record. Billing and usage records are downstream reporting only; a
  retry after a lost response may call the provider again.
