import type {
  AgentTurnMessage,
  ToolCall,
  ToolDefinition,
  ToolResultBlock,
  ToolTurnRequest,
  ToolTurnResult,
} from '@modules/model-providers/tool-turn-types'
import { AUTOTAGGER_AGENT_INSTRUCTIONS } from './agent-instructions.mts'
import {
  parseSubmission,
  runSearchTopicsTool,
  SEARCH_TOPICS_TOOL,
  SUBMIT_TOPICS_TOOL,
  type SearchTopics,
} from './agent-tools.mts'

export type AutotaggerAgentBounds = {
  maxTurns: number
  maxToolCalls: number
  maxOutputTokens: number
}

/** Why the loop ended. Only `submitted` carries an answer; every other reason answers with none. */
export type AutotaggerAgentEnd =
  | 'submitted'
  | 'turns-exhausted'
  | 'output-budget-exhausted'
  | 'stalled'

export type AutotaggerAgentLoopResult = {
  topicIds: readonly string[]
  end: AutotaggerAgentEnd
  turns: number
  toolCalls: number
}

export type AutotaggerAgentLoopInput = {
  input: string
  tools: readonly ToolDefinition[]
  candidateIds: readonly string[]
  bounds: AutotaggerAgentBounds
  search: SearchTopics
  /** One billed model turn; the executor wires spend cap, attempt reservation and the ledger. */
  callTurn: (request: ToolTurnRequest, turn: number) => Promise<ToolTurnResult>
  safetyIdentifier?: string
  /** The run's deadline, checked before every turn so a slow run stops billing at its lease. */
  signal?: AbortSignal
}

function callsSignature(calls: readonly ToolCall[]): string {
  return JSON.stringify(calls.map(call => ({ name: call.name, input: call.input })))
}

/**
 * The bounded tool-use loop of the reasoning autotagger. Each turn the model must call a tool:
 * `lookup_candidate_topics` to look a topic up, or `submit_topics` to answer with candidate ids. The loop
 * ends on the first valid submission, and answers with no topics when it runs out of turns or
 * output tokens, or repeats itself: a bound is a stop, never a reason to guess. Tool calls past the
 * bound get an error result that tells the model to submit. Every id the loop returns was checked
 * against the closed candidate set.
 */
export async function runAutotaggerAgentLoop(
  params: AutotaggerAgentLoopInput,
): Promise<AutotaggerAgentLoopResult> {
  const { bounds } = params
  const candidates = new Set(params.candidateIds)
  const messages: AgentTurnMessage[] = [{ role: 'user', text: params.input }]
  let outputTokens = 0
  let toolCallCount = 0
  let previousSignature: string | undefined
  const result = (end: AutotaggerAgentEnd, turns: number, topicIds: readonly string[] = []) => ({
    topicIds,
    end,
    turns,
    toolCalls: toolCallCount,
  })

  for (let turn = 1; turn <= bounds.maxTurns; turn++) {
    params.signal?.throwIfAborted()
    const remaining = bounds.maxOutputTokens - outputTokens
    if (remaining <= 0) return result('output-budget-exhausted', turn - 1)
    const response = await params.callTurn(
      {
        instructions: AUTOTAGGER_AGENT_INSTRUCTIONS,
        messages,
        tools: params.tools,
        maxOutputTokens: remaining,
        safetyIdentifier: params.safetyIdentifier,
        promptCacheKey: 'autotagger-agent-v1',
      },
      turn,
    )
    outputTokens += response.usage.outputTokens
    const { text, toolCalls } = response.output
    messages.push({ role: 'assistant', text, toolCalls })
    const signature = callsSignature(toolCalls)
    if (signature === previousSignature) return result('stalled', turn)
    previousSignature = signature

    const results: ToolResultBlock[] = []
    for (const call of toolCalls) {
      if (call.name === SUBMIT_TOPICS_TOOL) {
        const submission = parseSubmission(call.input, candidates)
        if (submission.ok) return result('submitted', turn, submission.topicIds)
        results.push({ callId: call.id, content: submission.error, isError: true })
        continue
      }
      if (call.name !== SEARCH_TOPICS_TOOL) {
        results.push({ callId: call.id, content: `Unknown tool ${call.name}.`, isError: true })
        continue
      }
      if (toolCallCount >= bounds.maxToolCalls) {
        results.push({
          callId: call.id,
          content: 'Tool call limit reached. Call submit_topics now.',
          isError: true,
        })
        continue
      }
      toolCallCount++
      const output = await runSearchTopicsTool(call.input, candidates, params.search)
      results.push({ callId: call.id, content: output.content, isError: output.isError })
    }
    messages.push({ role: 'tool', results })
  }
  return result('turns-exhausted', bounds.maxTurns)
}
