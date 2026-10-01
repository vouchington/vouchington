import createHttpError from 'http-errors'
import {
  formatToolResult,
  type OpenAIFunctionCall,
  type OpenAIFunctionCallOutput,
} from './tool-calls.mts'
import { validateAgentToolArguments } from './validate-tool-arguments.mts'

export type AgentTool<TArgs = never, TResult = never> = {
  schema: { name: string; [key: string]: unknown }
  executor: (args: TArgs) => AsyncGenerator<unknown, unknown> | Promise<unknown> | unknown
  formatResult?: (callId: string, result: TResult) => OpenAIFunctionCallOutput
}

/** Params required for dispatching a batch of tool calls (toolCalls drives the iteration). */
export type ExecuteToolCallsParams = {
  toolCalls: OpenAIFunctionCall[]
  tools: AgentTool[]
  onBeforeCall?: (toolCall: OpenAIFunctionCall) => { skip: true; skipResult?: unknown } | undefined
  onAfterCall?: (toolCall: OpenAIFunctionCall, result: unknown) => void
  // Called for every tool call failure: unknown tool, JSON parse error, or executor throw.
  onCallError?: (toolCall: OpenAIFunctionCall, error: Error) => void
}

/** Params for dispatching a single tool call (no toolCalls batch needed). */
export type DispatchOneToolCallParams = Omit<ExecuteToolCallsParams, 'toolCalls'>

export async function executeToolCalls(
  params: ExecuteToolCallsParams,
): Promise<{ toolResults: OpenAIFunctionCallOutput[] }> {
  const toolResults = await Promise.all(
    params.toolCalls.map(toolCall => drainGenerator(dispatchOneToolCall(toolCall, params))),
  )
  return { toolResults }
}

/**
 * Streaming variant of executeToolCalls for use in async generator contexts.
 *
 * Processes tool calls sequentially (not in parallel). When an executor returns an
 * AsyncGenerator, its yielded values are re-yielded to the caller before the final
 * result is collected. This enables real-time delivery of executor progress events
 * to an outer stream.
 *
 * Use executeToolCalls in runToolLoop and other non-streaming callers — they benefit
 * from parallel execution.
 */
export async function* streamingExecuteToolCalls(
  params: ExecuteToolCallsParams,
): AsyncGenerator<unknown, { toolResults: OpenAIFunctionCallOutput[] }> {
  const toolResults: OpenAIFunctionCallOutput[] = []
  for (const toolCall of params.toolCalls) {
    const toolResult = yield* dispatchOneToolCall(toolCall, params)
    toolResults.push(toolResult)
  }
  return { toolResults }
}

export async function* dispatchOneToolCall(
  toolCall: OpenAIFunctionCall,
  params: DispatchOneToolCallParams,
): AsyncGenerator<unknown, OpenAIFunctionCallOutput> {
  const { tools, onBeforeCall, onAfterCall, onCallError } = params

  const beforeResult = onBeforeCall?.(toolCall)
  if (beforeResult?.skip) {
    const skipResult = beforeResult.skipResult ?? { skipped: true }
    return formatToolResult(toolCall.call_id, skipResult)
  }

  const toolEntry = tools.find(t => t.schema.name === toolCall.name)
  if (!toolEntry) {
    const err = new Error(`Unknown tool: ${toolCall.name}`)
    const errorResult = { error: err.message }
    onCallError?.(toolCall, err)
    return formatToolResult(toolCall.call_id, errorResult)
  }

  let args: unknown
  try {
    args = toolCall.arguments ? (JSON.parse(toolCall.arguments) as unknown) : {}
  } catch {
    const err = createHttpError(422, `Invalid JSON arguments for tool ${toolCall.name}`)
    const parseError = { error: err.message }
    onCallError?.(toolCall, err)
    return formatToolResult(toolCall.call_id, parseError)
  }

  const validationError = validateAgentToolArguments(toolEntry.schema.parameters, args)
  if (validationError) {
    const err = createHttpError(
      422,
      `Invalid arguments for tool ${toolCall.name}: ${validationError}`,
    )
    const invalidArguments = { error: err.message }
    onCallError?.(toolCall, err)
    return formatToolResult(toolCall.call_id, invalidArguments)
  }

  let result: unknown
  let executorFailed = false
  try {
    // Parsed tool JSON is `unknown`. Concrete executors stay assignable through `TArgs = never`.
    const executorResult = toolEntry.executor(args as never)
    if (isAsyncGenerator(executorResult)) {
      result = yield* executorResult
    } else {
      result = await executorResult
    }
  } catch (error) {
    // Executor exceptions are converted to error result objects returned to the model.
    // Retriable errors (rate limits, transient failures) thrown inside tool executors
    // will NOT propagate to the outer caller's catch block — tool executors must
    // handle their own retriable errors or avoid throwing them.
    const err = error instanceof Error ? error : new Error(String(error))
    result = { error: err.message }
    executorFailed = true
    onCallError?.(toolCall, err)
  }

  // Skip onAfterCall on executor failure — callers should not track failure results
  // (e.g. incrementing "duplicates_skipped" for what was actually a thrown error)
  if (!executorFailed) onAfterCall?.(toolCall, result)

  // On executor failure, skip custom formatResult and use formatToolResult directly
  // to avoid passing error-shaped results to handlers expecting successful output.
  if (executorFailed) return formatToolResult(toolCall.call_id, result)
  return (toolEntry.formatResult ?? formatToolResult)(toolCall.call_id, result as never)
}

async function drainGenerator<TYield, TReturn>(
  gen: AsyncGenerator<TYield, TReturn>,
): Promise<TReturn> {
  let step = await gen.next()
  while (!step.done) {
    // oxlint-disable-next-line no-await-in-loop -- each next() depends on the prior generator state
    step = await gen.next()
  }
  return step.value
}

function isAsyncGenerator(value: unknown): value is AsyncGenerator<unknown, unknown> {
  return (
    value != null &&
    typeof value === 'object' &&
    Symbol.asyncIterator in (value as object) &&
    typeof (value as AsyncGenerator).next === 'function'
  )
}
