# Choosing an Agent Pattern

[Back to @agents/\_shared](../../../../../backend/agents/_shared/README.md#choosing-an-agent-pattern)

Pick the simplest pattern that fits your agent's needs. There is no shared tool loop (the one tool-using agent, the
[C7 autotagger](../autotagger/README.md#c7-scoped-reasoning-autotagger), owns its bounded loop on
`generateToolTurn`); a decision that scores content belongs in a
[classifier](../classifiers/README.md) instead.

1. **Single call** — use `generateJson` from `@modules/model-providers` inside `callAgentModel` when no tool use is needed (every answer-writing agent). The request carries a JSON schema and a `parse`, so the provider layer returns validated output.
