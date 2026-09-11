import {
  dispatchOneToolCall,
  type OpenAIFunctionCall,
  type OpenAIFunctionCallOutput,
  type DispatchOneToolCallParams,
} from '@services/openai-agents'
import type { RunToolLoopConfig } from './run-tool-loop.mts'
import type {
  RunToolLoopStreamEvent,
  RunToolLoopSubagentEvent,
} from './run-tool-loop-streaming-types.mts'

type DispatchIterationToolCallsParams = Pick<
  RunToolLoopConfig,
  'tools' | 'writeRunEvent' | 'onBeforeCall' | 'onAfterCall'
> & {
  onCallError: (toolCall: OpenAIFunctionCall, error: Error) => void
  dispatchCall: typeof dispatchOneToolCall
}

/**
 * Dispatches every tool call requested in one runToolLoopStreaming iteration, yielding
 * tool_call / subagent_step / subagent_text / tool_result events as each call resolves, and
 * returns the collected results to feed back into the next iteration's input.
 */
export async function* dispatchIterationToolCalls(
  toolCalls: OpenAIFunctionCall[],
  {
    tools,
    writeRunEvent,
    onBeforeCall,
    onAfterCall,
    onCallError,
    dispatchCall,
  }: DispatchIterationToolCallsParams,
): AsyncGenerator<RunToolLoopStreamEvent, OpenAIFunctionCallOutput[]> {
  const dispatchParams: DispatchOneToolCallParams = {
    tools,
    writeRunEvent,
    onBeforeCall,
    onAfterCall,
    onCallError,
  }

  const iterationToolResults: OpenAIFunctionCallOutput[] = []

  for (const toolCall of toolCalls) {
    // Evaluate onBeforeCall first so we only emit tool_call for work that will execute.
    // Memoize the result and pass it back to dispatchOneToolCall to avoid a second invocation.
    const beforeResult = onBeforeCall?.(toolCall)
    const isSkipped = beforeResult?.skip === true

    if (!isSkipped) {
      yield {
        type: 'tool_call',
        call_id: toolCall.call_id,
        name: toolCall.name,
        arguments: toolCall.arguments,
      }
    }

    const resolvedParams =
      onBeforeCall !== undefined
        ? { ...dispatchParams, onBeforeCall: () => beforeResult }
        : dispatchParams
    const dispatchGen = dispatchCall(toolCall, resolvedParams)
    let dispatchStep = await dispatchGen.next()
    while (!dispatchStep.done) {
      const dispatchEvent = dispatchStep.value as RunToolLoopStreamEvent
      yield dispatchEvent.type === 'subagent_step' || dispatchEvent.type === 'subagent_text'
        ? { ...(dispatchEvent as RunToolLoopSubagentEvent), tool_call_id: toolCall.call_id }
        : dispatchEvent
      dispatchStep = await dispatchGen.next()
    }
    const toolResult = dispatchStep.value
    iterationToolResults.push(toolResult)
    if (!isSkipped) {
      yield { type: 'tool_result', call_id: toolCall.call_id, output: toolResult.output }
    }
  }

  return iterationToolResults
}
