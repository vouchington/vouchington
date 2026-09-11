import { createOpenAIResponse } from './create-response.mts'
import { agentToolsToSchemas } from './build-agent-tools.mts'
import {
  getFunctionCallsFromOutput,
  executeToolCalls,
  type OpenAIFunctionCallOutput,
  type OpenAIFunctionCall,
} from '@services/openai-agents'
import onError from '@modules/on-error'
import type { RunToolLoopConfig, RunToolLoopResult } from './run-tool-loop/types.mts'
import { assertSpendCapNotBreachedForIteration } from './run-tool-loop/spend-cap-check.mts'
import {
  extractResponseUsage,
  getResponseFinishReason,
  tryExtractText,
} from './run-tool-loop/response-summary.mts'
import { callRecordingToolLoopUsage } from './run-tool-loop/record-usage.mts'

export type { RunToolLoopConfig, RunToolLoopResult } from './run-tool-loop/types.mts'
export {
  extractResponseUsage,
  getResponseFinishReason,
  tryExtractText,
} from './run-tool-loop/response-summary.mts'

/**
 * Runs an OpenAI tool-calling loop until the model stops requesting tool calls
 * or maxIterations is reached.
 *
 * `iterations` counts model responses (one per `model_response` event, one per
 * createOpenAIResponse call). On the max_iterations path it makes one extra
 * tool_choice: 'none' call to get a final text response, so `iterations` is
 * `maxIterations + 1` there — `maxIterations` bounds the tool-calling loop, not
 * the total call count.
 */
export async function runToolLoop(config: RunToolLoopConfig): Promise<RunToolLoopResult> {
  const {
    model,
    instructions,
    tools,
    input,
    maxIterations,
    safetyIdentifier,
    extraParams = {},
    metadata,
    agentSlug,
    communityId,
    postId,
    signal,
    maxRetries,
    onCallError = (_toolCall: OpenAIFunctionCall, error: Error) => onError(error),
    onBeforeCall,
    onAfterCall,
    writeRunEvent,
    onIteration,
    onAfterIteration,
    deps = {},
  } = config

  const toSchemas = deps.agentToolsToSchemas ?? agentToolsToSchemas
  const createResponse = deps.createOpenAIResponse ?? createOpenAIResponse
  const getCalls = deps.getFunctionCallsFromOutput ?? getFunctionCallsFromOutput
  const executeCalls = deps.executeToolCalls ?? executeToolCalls

  const toolSchemas = toSchemas(tools) as never

  let toolResults: OpenAIFunctionCallOutput[] = []
  let iterations = 0
  let previousResponseId = config.previousResponseId
  let lastResponseId: string | undefined

  while (iterations < maxIterations) {
    // Bail before issuing the next OpenAI call when the caller has aborted.
    // The signal is also forwarded into createOpenAIResponse, but checking here
    // avoids spinning up another request after a long tool batch.
    signal?.throwIfAborted()

    await assertSpendCapNotBreachedForIteration(agentSlug, deps)

    iterations++

    const responseInput = iterations === 1 ? input : toolResults
    const response = await callRecordingToolLoopUsage(
      createResponse,
      {
        model,
        instructions,
        tools: toolSchemas,
        tool_choice: 'auto',
        input: responseInput,
        safety_identifier: safetyIdentifier,
        previous_response_id: previousResponseId,
        ...(metadata && { metadata }),
        ...extraParams,
      } as Parameters<typeof createResponse>[0],
      { signal, maxRetries },
      { agentSlug, communityId, postId },
      { recordAgentResponseUsage: deps.recordAgentResponseUsage },
    )

    lastResponseId = response.id
    previousResponseId = response.id

    const toolCalls = getCalls(response.output)

    await writeRunEvent?.(
      'model_response',
      {
        response_id: response.id,
        iteration: iterations,
        finish_reason: getResponseFinishReason(response),
        usage: extractResponseUsage(response),
        tool_calls_count: toolCalls.length,
      },
      response.output,
    )

    // onIteration fires before the toolCalls.length === 0 check. If it returns
    // { stop: true }, that reason takes precedence over 'no_tool_calls' even
    // when there are no tool calls in this iteration.
    if (onIteration) {
      const decision = onIteration({ iterations, response, toolCalls })
      if (decision?.stop) {
        const text = tryExtractText(response)
        return { text, iterations, terminationReason: decision.reason, lastResponseId }
      }
    }

    if (toolCalls.length === 0) {
      const text = tryExtractText(response)
      return { text, iterations, terminationReason: 'no_tool_calls', lastResponseId }
    }

    const toolCallResults = await executeCalls({
      toolCalls,
      tools,
      writeRunEvent,
      onBeforeCall,
      onAfterCall,
      onCallError,
    })

    toolResults = toolCallResults.toolResults

    if (onAfterIteration) {
      const decision = onAfterIteration({ iterations, response, toolCalls, toolResults })
      if (decision?.stop) {
        const text = tryExtractText(response)
        return { text, iterations, terminationReason: decision.reason, lastResponseId }
      }
    }
  }

  // Fallback: request final answer without tools.
  // Submit the last iteration's toolResults so the previous response's pending
  // function_calls are satisfied and the model has access to the tool outputs.
  // Fall back to the original input only when no tool results were produced
  // (pathological case: maxIterations: 0).
  await assertSpendCapNotBreachedForIteration(agentSlug, deps)

  const finalResponse = await callRecordingToolLoopUsage(
    createResponse,
    {
      model,
      instructions,
      tool_choice: 'none',
      input: toolResults.length > 0 ? toolResults : input,
      safety_identifier: safetyIdentifier,
      previous_response_id: previousResponseId,
      ...(metadata && { metadata }),
      ...extraParams,
    } as Parameters<typeof createResponse>[0],
    { signal, maxRetries },
    { agentSlug, communityId, postId },
    { recordAgentResponseUsage: deps.recordAgentResponseUsage },
  )

  lastResponseId = finalResponse.id
  iterations++
  await writeRunEvent?.(
    'model_response',
    {
      response_id: finalResponse.id,
      iteration: iterations,
      finish_reason: getResponseFinishReason(finalResponse),
      usage: extractResponseUsage(finalResponse),
      tool_calls_count: 0,
    },
    finalResponse.output,
  )
  const text = tryExtractText(finalResponse)
  return { text, iterations, terminationReason: 'max_iterations', lastResponseId }
}
