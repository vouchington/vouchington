import { describe, expect, it } from 'vitest'

import {
  executeToolCalls,
  streamingExecuteToolCalls,
  type AgentTool,
  type ExecuteToolCallsParams,
} from '../execute-tool-calls.mts'

import type { OpenAIFunctionCall, OpenAIFunctionCallOutput } from '../tool-calls.mts'

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

describe.each(VARIANTS)('%s — 422 on invalid JSON', (_name, run) => {
  it('onCallError receives 422 error for invalid JSON arguments', async () => {
    const onCallError = spy<[OpenAIFunctionCall, Error]>()

    await run({
      toolCalls: [
        { type: 'function_call', call_id: 'c1', name: 'my_tool', arguments: 'NOT VALID JSON{{{' },
      ],
      tools: [tool('my_tool', () => 'should not run')],
      onCallError,
    })

    expect(onCallError.calls).toHaveLength(1)
    const [, err] = onCallError.calls[0]
    expect(err).toBeInstanceOf(Error)
    expect((err as Error & { status?: number }).status).toBe(422)
  })
})

describe('executeToolCalls', () => {
  it('executes tool calls in parallel', async () => {
    const started: Record<string, boolean> = {}
    let resolveA!: () => void
    let resolveB!: () => void

    const promise = executeToolCalls({
      toolCalls: [call('a', undefined, 'id_a'), call('b', undefined, 'id_b')],
      tools: [
        tool(
          'a',
          () =>
            new Promise<string>(r => {
              started.a = true
              resolveA = () => r('a')
            }),
        ),
        tool(
          'b',
          () =>
            new Promise<string>(r => {
              started.b = true
              resolveB = () => r('b')
            }),
        ),
      ],
    })

    // Both executors run synchronously before Promise.all awaits
    expect(started.a).toBe(true)
    expect(started.b).toBe(true)

    // Resolve in reverse order — result order must still match input order
    resolveB()
    resolveA()
    const { toolResults } = await promise

    expect(JSON.parse(toolResults[0].output)).toBe('a')
    expect(JSON.parse(toolResults[1].output)).toBe('b')
  })
})

describe('streamingExecuteToolCalls', () => {
  it('executes tool calls sequentially', async () => {
    const log: string[] = []

    const { toolResults } = await collect(
      streamingExecuteToolCalls({
        toolCalls: [call('a', undefined, 'id_a'), call('b', undefined, 'id_b')],
        tools: [
          tool('a', async () => {
            log.push('a_start')
            await Promise.resolve()
            log.push('a_end')
            return 'a'
          }),
          tool('b', () => {
            log.push('b_start')
            return 'b'
          }),
        ],
      }),
    )

    expect(log).toEqual(['a_start', 'a_end', 'b_start'])
    expect(JSON.parse(toolResults[0].output)).toBe('a')
    expect(JSON.parse(toolResults[1].output)).toBe('b')
  })

  it('re-yields intermediate generator events in order', async () => {
    const gen = () => generator(['event_1', 'event_2'], { done: true })

    const { events, toolResults } = await collect(
      streamingExecuteToolCalls({
        toolCalls: [call('my_tool')],
        tools: [tool('my_tool', gen)],
      }),
    )

    expect(events).toEqual(['event_1', 'event_2'])
    expect(JSON.parse(toolResults[0].output)).toEqual({ done: true })
  })

  it('interleaves generator events from multiple calls in call order', async () => {
    const genA = () => generator(['a1', 'a2'], 'a')
    const genB = () => generator(['b1'], 'b')

    const { events } = await collect(
      streamingExecuteToolCalls({
        toolCalls: [call('a', undefined, 'id_a'), call('b', undefined, 'id_b')],
        tools: [tool('a', genA), tool('b', genB)],
      }),
    )

    expect(events).toEqual(['a1', 'a2', 'b1'])
  })
  // keep generated shard bindings live for typecheck
  void (0 as unknown as typeof spy)
  void (0 as unknown as typeof spyWith)
  void (0 as unknown as typeof writeEventSpy)
  void (0 as unknown as typeof VARIANTS)
})
