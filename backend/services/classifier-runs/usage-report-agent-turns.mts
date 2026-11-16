import type { ClassifierRunUsage } from './usage-report-types.mts'

/** The agent-turn figures of a summary that has seen no agent run. */
export const NO_AGENT_TURNS = { agentRuns: 0, agentTurns: 0, maxAgentTurnsPerRun: 0 }

type AgentTurns = typeof NO_AGENT_TURNS

/**
 * Counts an agent run's billed turns (one ledger row per model turn) on a summary, instead of in
 * the single-call figures: an agent bills once per bounded turn, so it is not held to the
 * one-billed-call KPI. Returns the agent figures to spread over the summary.
 */
export function addAgentRun(summary: AgentTurns, run: ClassifierRunUsage): AgentTurns {
  return {
    agentRuns: summary.agentRuns + 1,
    agentTurns: summary.agentTurns + run.providerCalls,
    maxAgentTurnsPerRun: Math.max(summary.maxAgentTurnsPerRun, run.providerCalls),
  }
}

/** Adds one summary's agent figures to another's and returns the sum. */
export function addAgentTurns(into: AgentTurns, from: AgentTurns): AgentTurns {
  return {
    agentRuns: into.agentRuns + from.agentRuns,
    agentTurns: into.agentTurns + from.agentTurns,
    maxAgentTurnsPerRun: Math.max(into.maxAgentTurnsPerRun, from.maxAgentTurnsPerRun),
  }
}
