import type { AgentToolEntry } from './build-agent-tools.mts'
import type { BasicUser } from '@services/users/types'
import type { Tool } from '@voucha/tools'
import type { SubagentStepEvent } from './subagent-types.mts'

/** The result returned by any subagent tool. */
export interface SubagentResult {
  /** The subagent's synthesized text response, or null if the run failed. */
  summary: string | null
  /** Number of tool calls the subagent made (useful for observability). */
  steps: number
}

/**
 * Configuration for a subagent tool created by createSubagentTool.
 * The schema name must start with `run_`.
 */
export interface SubagentToolConfig<TArgs> {
  /** OpenAI tool name. Must start with `run_`. */
  name: string
  /** OpenAI tool description shown to the orchestrator model. */
  description: string
  /** JSON schema parameters for the tool. */
  parameters: Record<string, unknown>
  /** Human-readable agent name used in progress events (e.g. 'research'). */
  agentName: string
  /** System prompt for the subagent's runToolLoop. */
  systemPrompt: string
  /** Maximum runToolLoop iterations before a forced-completion fallback call. */
  maxIterations: number
  /**
   * Raw tool entries available to the subagent. These are curried with currentUser
   * inside the executor via buildAgentTools — do not pre-curry them here.
   */
  toolEntries: AgentToolEntry[]
  /** Build the string input for runToolLoop from the typed tool args. */
  getInput: (args: TArgs) => string | Promise<string>
  /**
   * OpenAI service tier for the subagent's LLM calls.
   * Use 'flex' only for background, non-interactive, read-only agents (e.g. research, discovery).
   * Do NOT use 'flex' for user-initiated mutations (e.g. profile agent) — latency matters there.
   * Omit to use OpenAI's default tier (recommended for user-facing agents).
   */
  serviceTier?: 'flex' | 'default'
  /**
   * Application-owned free-capacity retry budget. Subagent tools run nested inside a chat turn, so this
   * should normally be CHAT_SUBAGENT_RETRY_POLICY.maxRetries (see retry-policy.mts) rather than
   * left to fall back to the default 2 — a subagent silently retrying less than its parent
   * turn would fail before the turn itself would have.
   */
  maxRetries?: number
}

/** Extra arguments curried into the subagent tool executor beyond currentUser. */
export type SubagentToolCurryArgs = [
  conversationId: string,
  conversationMessageId: string,
  parentAgenticRunId: string,
  signal: AbortSignal | undefined,
]

/** A Tool whose executor is an async generator that yields SubagentStepEvent progress events. */
export type SubagentTool<TArgs> = Omit<
  Tool<TArgs, SubagentResult, SubagentToolCurryArgs>,
  'function'
> & {
  function: (
    currentUser: BasicUser,
    conversationId: string,
    conversationMessageId: string,
    parentAgenticRunId: string,
    signal: AbortSignal | undefined,
  ) => (args: TArgs) => AsyncGenerator<SubagentStepEvent, SubagentResult>
}
