import { streamOpenAIResponse } from './create-response.mts'
import { agentToolsToSchemas } from './build-agent-tools.mts'
import {
  getFunctionCallsFromOutput,
  dispatchOneToolCall,
  type OpenAIFunctionCall,
  type OpenAIFunctionCallOutput,
} from '@services/openai-agents'
import {
  tryExtractText,
  getResponseFinishReason,
  extractResponseUsage,
  type RunToolLoopConfig,
  type RunToolLoopResult,
} from './run-tool-loop.mts'
import onError from '@modules/on-error'
import { recordToolLoopUsage, recordToolLoopFailedUsage } from './run-tool-loop/record-usage.mts'
import { assertSpendCapNotBreachedForIteration } from './run-tool-loop/spend-cap-check.mts'
import { requestFinalStreamingResponse } from './run-tool-loop-streaming-final.mts'
import { dispatchIterationToolCalls } from './run-tool-loop-streaming-dispatch.mts'
import {
  createOpenAIResponseAttemptHooks,
  nextOpenAIResponseStreamStep,
} from './openai-response-attempt-hooks.mts'
import type { RunToolLoopStreamEvent } from './run-tool-loop-streaming-types.mts'
export type { RunToolLoopStreamEvent } from './run-tool-loop-streaming-types.mts'
/* no-mistakes: integration=openai */
export async function* runToolLoopStreaming(
  config: RunToolLoopConfig,
): AsyncGenerator<RunToolLoopStreamEvent, RunToolLoopResult> {
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
  const streamResponse = deps.streamOpenAIResponse ?? streamOpenAIResponse
  const getCalls = deps.getFunctionCallsFromOutput ?? getFunctionCallsFromOutput
  const dispatchCall = deps.dispatchOneToolCall ?? dispatchOneToolCall
  const attemptHooks = agentSlug ? createOpenAIResponseAttemptHooks(agentSlug, deps) : undefined

  const toolSchemas = toSchemas(tools) as never

  let toolResults: OpenAIFunctionCallOutput[] = []
  let iterations = 0
  let previousResponseId = config.previousResponseId
  let lastResponseId: string | undefined

  while (iterations < maxIterations) {
    signal?.throwIfAborted()

    await assertSpendCapNotBreachedForIteration(agentSlug, deps)

    iterations++

    const responseInput = iterations === 1 ? input : toolResults
    // Captured before the request starts so a stream that begins before UTC midnight and finishes
    // after is still charged to its request day (daily-total.mts windows by this, not by when
    // recording runs) -- see RecordAgentResponseUsageParams.createdAt.
    const requestStartedAt = new Date()
    const responseGen = streamResponse(
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
      } as Parameters<typeof streamResponse>[0],
      { signal, maxRetries },
    )
    let response
    try {
      let responseStep = await nextOpenAIResponseStreamStep(responseGen, attemptHooks)
      while (!responseStep.done) {
        yield { type: 'text', content: responseStep.value.delta }
        responseStep = await nextOpenAIResponseStreamStep(responseGen, attemptHooks)
      }
      response = responseStep.value
    } catch (error) {
      // The stream can end on a failed/incomplete terminal response, which still billed tokens —
      // record from the thrown error before propagating so a queued retry doesn't compound an
      // unrecorded charge with another one.
      await recordToolLoopFailedUsage(
        error,
        {
          agentSlug,
          communityId,
          postId,
          createdAt: requestStartedAt,
        },
        { recordAgentResponseUsage: deps.recordAgentResponseUsage },
      )
      throw error
    }

    lastResponseId = response.id
    previousResponseId = response.id

    await recordToolLoopUsage(
      { agentSlug, communityId, postId, response, createdAt: requestStartedAt },
      { recordAgentResponseUsage: deps.recordAgentResponseUsage },
    )

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

    yield {
      type: 'model_response',
      response_id: response.id,
      iteration: iterations,
      tool_calls_count: toolCalls.length,
    }

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

    toolResults = yield* dispatchIterationToolCalls(toolCalls, {
      tools,
      writeRunEvent,
      onBeforeCall,
      onAfterCall,
      onCallError,
      dispatchCall,
    })

    if (onAfterIteration) {
      const decision = onAfterIteration({ iterations, response, toolCalls, toolResults })
      if (decision?.stop) {
        const text = tryExtractText(response)
        return { text, iterations, terminationReason: decision.reason, lastResponseId }
      }
    }
  }

  return yield* requestFinalStreamingResponse({
    extraParams,
    deps,
    input,
    instructions,
    iterations,
    maxRetries,
    metadata,
    model,
    agentSlug,
    communityId,
    postId,
    previousResponseId,
    safetyIdentifier,
    signal,
    toolResults,
    writeRunEvent,
    attemptHooks,
  })
}
