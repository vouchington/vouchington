import {
  executeToolCalls,
  streamingExecuteToolCalls,
  type AgentTool,
  type ExecuteToolCallsParams,
} from '../../../services/openai-agents/execute-tool-calls.mts'

import type {
  OpenAIFunctionCall,
  OpenAIFunctionCallOutput,
} from '../../../services/openai-agents/tool-calls.mts'

// Lightweight call tracker (no vi.fn — this file has no module-level mocks)
function spy<TArgs extends unknown[]>(): ((...args: TArgs) => void) & { calls: TArgs[] } {
  const calls: TArgs[] = []
  return Object.assign((...args: TArgs) => void calls.push(args), { calls })
}

function spyWith<TArgs extends unknown[], TReturn>(
  impl: (...args: TArgs) => TReturn,
): ((...args: TArgs) => TReturn) & { calls: TArgs[] } {
  const calls: TArgs[] = []
  return Object.assign(
    (...args: TArgs): TReturn => {
      calls.push(args)
      return impl(...args)
    },
    { calls },
  )
}

// Tracked async write function compatible with RunEventWriter
function writeEventSpy() {
  const calls: unknown[][] = []
  const fn: NonNullable<ExecuteToolCallsParams['writeRunEvent']> = (...args) => {
    calls.push(args as unknown[])
    return Promise.resolve()
  }
  return Object.assign(fn, { calls })
}

function call(name: string, args?: unknown, callId = `call_${name}`): OpenAIFunctionCall {
  return {
    type: 'function_call',
    call_id: callId,
    name,
    arguments: args !== undefined ? JSON.stringify(args) : '',
  }
}

function tool(
  name: string,
  executor: AgentTool['executor'],
  formatResult?: AgentTool['formatResult'],
): AgentTool {
  return { schema: { name }, executor, ...(formatResult != null ? { formatResult } : {}) }
}

async function collect(gen: AsyncGenerator<unknown, { toolResults: OpenAIFunctionCallOutput[] }>) {
  const events: unknown[] = []
  let step = await gen.next()
  while (!step.done) {
    events.push(step.value)
    step = await gen.next()
  }
  return { events, toolResults: step.value.toolResults }
}

async function* generator(events: unknown[], result: unknown) {
  for (const event of events) yield event
  return result
}

type Runner = (
  params: ExecuteToolCallsParams,
) => Promise<{ toolResults: OpenAIFunctionCallOutput[]; events: unknown[] }>

const VARIANTS: [string, Runner][] = [
  [
    'executeToolCalls',
    async params => {
      const { toolResults } = await executeToolCalls(params)
      return { toolResults, events: [] }
    },
  ],
  ['streamingExecuteToolCalls', params => collect(streamingExecuteToolCalls(params))],
]

export {
  VARIANTS,
  call,
  collect,
  executeToolCalls,
  generator,
  spy,
  spyWith,
  streamingExecuteToolCalls,
  tool,
  writeEventSpy,
}
