import type {
  OpenAIResponseInput,
  OpenAIResponse,
  createOpenAIResponse,
  streamOpenAIResponse,
} from '../create-response.mts'
import type { createOpenRouterResponse } from '@modules/openrouter-utils'
import type {
  AgentTool,
  OpenAIFunctionCallOutput,
  OpenAIFunctionCall,
  dispatchOneToolCall,
  executeToolCalls,
  getFunctionCallsFromOutput,
} from '@services/openai-agents'
import type { RunEventWriter } from '@services/conversations-messages'
import type { agentToolsToSchemas } from '../build-agent-tools.mts'
import type {
  assertOpenAiSpendCapNotBreached,
  latchAccountingUncertainty,
} from '@services/ai-usage'
import type { recordAgentResponseUsage } from '../record-response-usage.mts'

export interface RunToolLoopDeps {
  agentToolsToSchemas?: typeof agentToolsToSchemas
  createOpenAIResponse?: typeof createOpenAIResponse
  createOpenRouterResponse?: typeof createOpenRouterResponse
  streamOpenAIResponse?: typeof streamOpenAIResponse
  getFunctionCallsFromOutput?: typeof getFunctionCallsFromOutput
  executeToolCalls?: typeof executeToolCalls
  dispatchOneToolCall?: typeof dispatchOneToolCall
  assertOpenAiSpendCapNotBreached?: typeof assertOpenAiSpendCapNotBreached
  latchAccountingUncertainty?: typeof latchAccountingUncertainty
  recordAgentResponseUsage?: typeof recordAgentResponseUsage
}

export interface RunToolLoopConfig {
  model: string
  /** Route this retained tool loop through OpenRouter instead of the direct OpenAI transport. */
  responseProvider?: 'openai' | 'openrouter'
  instructions?: string
  tools: AgentTool[]
  input: OpenAIResponseInput
  maxIterations: number
  safetyIdentifier: string
  previousResponseId?: string
  extraParams?: Record<string, unknown>
  metadata?: Record<string, string>
  /**
   * Identifies the calling agent for cost-ledger attribution (`ai_usage_records.agent_slug`).
   * Every real call site should set this — omitting it silently skips ledger recording for
   * every OpenAI call this loop makes, which is a cost-accounting gap, not a safe default.
   */
  agentSlug?: string
  /** Community this call is scoped to, for the ledger. Most non-moderation agents have none. */
  communityId?: string | null
  /** Post this call is scoped to, for the ledger, when the work is about one specific post. */
  postId?: string | null
  signal?: AbortSignal
  /**
   * Application-owned retry budget (default 2) for the known-unbilled flex
   * `resource_unavailable` 429. SDK retries are always disabled; ambiguous potentially billed
   * failures latch accounting uncertainty and stop. Chat widens this free-capacity budget without
   * pausing the whole ai-agents worker.
   */
  maxRetries?: number
  onCallError?: (toolCall: OpenAIFunctionCall, error: Error) => void
  onBeforeCall?: (toolCall: OpenAIFunctionCall) => { skip: true; skipResult?: unknown } | undefined
  onAfterCall?: (toolCall: OpenAIFunctionCall, result: unknown) => void
  writeRunEvent?: RunEventWriter
  onIteration?: (context: {
    iterations: number
    response: OpenAIResponse
    toolCalls: OpenAIFunctionCall[]
  }) => { stop: true; reason: string } | undefined
  onAfterIteration?: (context: {
    iterations: number
    response: OpenAIResponse
    toolCalls: OpenAIFunctionCall[]
    toolResults: OpenAIFunctionCallOutput[]
  }) => { stop: true; reason: string } | undefined
  deps?: RunToolLoopDeps
}

export interface RunToolLoopResult {
  text: string | null
  iterations: number
  terminationReason: 'no_tool_calls' | 'max_iterations' | (string & {})
  lastResponseId?: string
}
