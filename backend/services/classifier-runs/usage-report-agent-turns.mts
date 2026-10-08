import type { ClassifierRunUsage } from './usage-report-types.mts'

/** The agent-turn figures of a summary that has seen no agent run. */
export const NO_AGENT_TURNS = { agentRuns: 0, agentTurns: 0, maxAgentTurnsPerRun: 0 }

type AgentTurns = typeof NO_AGENT_TURNS

/**
 * Counts an agent run's billed turns (one ledger row per model turn) on a summary, instead of in
 * the single-call figures: an agent bills once per bounded turn, so it is not held to the
 * one-billed-call KPI.
 */
export function addAgentRun(summary: AgentTurns, run: ClassifierRunUsage): void {
  summary.agentRuns += 1
  summary.agentTurns += run.providerCalls
  summary.maxAgentTurnsPerRun = Math.max(summary.maxAgentTurnsPerRun, run.providerCalls)
}

/** Adds one summary's agent figures into another's. */
export function addAgentTurns(into: AgentTurns, from: AgentTurns): void {
  into.agentRuns += from.agentRuns
  into.agentTurns += from.agentTurns
  into.maxAgentTurnsPerRun = Math.max(into.maxAgentTurnsPerRun, from.maxAgentTurnsPerRun)
}
