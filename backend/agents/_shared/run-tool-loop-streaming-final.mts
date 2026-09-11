import { streamOpenAIResponse } from './create-response.mts'
import {
  extractResponseUsage,
  getResponseFinishReason,
  tryExtractText,
  type RunToolLoopConfig,
  type RunToolLoopResult,
} from './run-tool-loop.mts'
import type { OpenAIFunctionCallOutput } from '@services/openai-agents'
import type { RunToolLoopStreamEvent } from './run-tool-loop-streaming-types.mts'
import { recordToolLoopUsage, recordToolLoopFailedUsage } from './run-tool-loop/record-usage.mts'
import { assertSpendCapNotBreachedForIteration } from './run-tool-loop/spend-cap-check.mts'
import {
  createOpenAIResponseAttemptHooks,
  nextOpenAIResponseStreamStep,
  type OpenAIResponseAttemptHooks,
} from './openai-response-attempt-hooks.mts'

type RequestFinalStreamingResponseParams = Pick<
  RunToolLoopConfig,
  | 'model'
  | 'instructions'
  | 'input'
  | 'safetyIdentifier'
  | 'extraParams'
  | 'metadata'
  | 'signal'
  | 'maxRetries'
  | 'agentSlug'
  | 'communityId'
  | 'postId'
> & {
  iterations: number
  previousResponseId: string | undefined
  toolResults: OpenAIFunctionCallOutput[]
  writeRunEvent: RunToolLoopConfig['writeRunEvent']
  deps?: RunToolLoopConfig['deps']
  attemptHooks?: OpenAIResponseAttemptHooks
}

export async function* requestFinalStreamingResponse({
  extraParams = {},
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
  deps = {},
  attemptHooks = agentSlug ? createOpenAIResponseAttemptHooks(agentSlug, deps) : undefined,
}: RequestFinalStreamingResponseParams): AsyncGenerator<RunToolLoopStreamEvent, RunToolLoopResult> {
  const streamResponse = deps.streamOpenAIResponse ?? streamOpenAIResponse

  await assertSpendCapNotBreachedForIteration(agentSlug, deps)

  // Captured before the request starts so a stream that begins before UTC midnight and finishes
  // after is still charged to its request day -- see RecordAgentResponseUsageParams.createdAt.
  const requestStartedAt = new Date()
  const responseGen = streamResponse(
    {
      model,
      instructions,
      tool_choice: 'none',
      input: toolResults.length > 0 ? toolResults : input,
      safety_identifier: safetyIdentifier,
      previous_response_id: previousResponseId,
      ...(metadata && { metadata }),
      ...extraParams,
    } as Parameters<typeof streamResponse>[0],
    { signal, maxRetries },
  )
  let finalResponse
  try {
    let responseStep = await nextOpenAIResponseStreamStep(responseGen, attemptHooks)
    while (!responseStep.done) {
      yield { type: 'text', content: responseStep.value.delta }
      responseStep = await nextOpenAIResponseStreamStep(responseGen, attemptHooks)
    }
    finalResponse = responseStep.value
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

  await recordToolLoopUsage(
    { agentSlug, communityId, postId, response: finalResponse, createdAt: requestStartedAt },
    { recordAgentResponseUsage: deps.recordAgentResponseUsage },
  )

  const finalIteration = iterations + 1
  await writeRunEvent?.(
    'model_response',
    {
      response_id: finalResponse.id,
      iteration: finalIteration,
      finish_reason: getResponseFinishReason(finalResponse),
      usage: extractResponseUsage(finalResponse),
      tool_calls_count: 0,
    },
    finalResponse.output,
  )
  yield {
    type: 'model_response',
    response_id: finalResponse.id,
    iteration: finalIteration,
    tool_calls_count: 0,
  }
  const text = tryExtractText(finalResponse)
  return {
    text,
    iterations: finalIteration,
    terminationReason: 'max_iterations',
    lastResponseId: finalResponse.id,
  }
}
