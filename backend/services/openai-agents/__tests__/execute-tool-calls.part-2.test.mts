import {
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
} from '../../../test-helpers/services/openai-agents/execute-tool-calls-fixtures.mts'

import { describe, expect, it } from 'vitest'

import type { OpenAIFunctionCall } from '../tool-calls.mts'

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

const lookupSchema = {
  name: 'lookup',
  parameters: {
    type: 'object',
    additionalProperties: false,
    required: ['id'],
    properties: { id: { type: 'string' } },
  },
}

describe.each(VARIANTS)('%s — schema boundary', (_name, run) => {
  it('rejects wrong-shaped arguments before the executor', async () => {
    const executor = spyWith(() => 'ran')
    const onCallError = spy<[OpenAIFunctionCall, Error]>()

    await run({
      toolCalls: [call('lookup', { name: 'nope' })],
      tools: [{ schema: lookupSchema, executor }],
      onCallError,
    })

    expect(executor.calls).toHaveLength(0)
    expect(onCallError.calls).toHaveLength(1)
    const [, err] = onCallError.calls[0]
    expect((err as Error & { status?: number }).status).toBe(422)
  })

  it('runs the executor when arguments match the tool schema', async () => {
    const executor = spyWith(() => 'ran')

    const { toolResults } = await run({
      toolCalls: [call('lookup', { id: 'a' })],
      tools: [{ schema: lookupSchema, executor }],
    })

    expect(executor.calls).toEqual([[{ id: 'a' }]])
    expect(toolResults[0]?.output).toBe(JSON.stringify('ran'))
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
