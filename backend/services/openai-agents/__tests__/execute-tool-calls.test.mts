import {
  VARIANTS,
  call,
  generator,
  spy,
  spyWith,
  tool,
} from '../../../test-helpers/services/openai-agents/execute-tool-calls-fixtures.mts'

import { describe, expect, it } from 'vitest'

import type { OpenAIFunctionCall } from '../tool-calls.mts'

describe.each(VARIANTS)('%s', (_name, run) => {
  it('returns formatted result for a sync executor', async () => {
    const onAfterCall = spy<[OpenAIFunctionCall, unknown]>()
    const toolCall = call('my_tool', { x: 3 })

    const { toolResults } = await run({
      toolCalls: [toolCall],
      tools: [tool('my_tool', (args: { x: number }) => ({ computed: args.x * 2 }))],
      onAfterCall,
    })

    expect(toolResults).toHaveLength(1)
    expect(JSON.parse(toolResults[0].output)).toEqual({ computed: 6 })
    expect(toolResults[0].call_id).toBe('call_my_tool')
    expect(onAfterCall.calls).toHaveLength(1)
    expect(onAfterCall.calls[0]).toEqual([toolCall, { computed: 6 }])
  })

  it('passes parsed arguments to executor', async () => {
    const executorCalls: unknown[][] = []
    await run({
      toolCalls: [call('my_tool', { key: 'value' })],
      tools: [tool('my_tool', (...args) => void executorCalls.push(args))],
    })

    expect(executorCalls[0]).toEqual([{ key: 'value' }])
  })

  it('passes empty object for empty arguments string', async () => {
    const executorCalls: unknown[][] = []
    await run({
      toolCalls: [{ type: 'function_call', call_id: 'c', name: 'my_tool', arguments: '' }],
      tools: [tool('my_tool', (...args) => void executorCalls.push(args))],
    })

    expect(executorCalls[0]).toEqual([{}])
  })

  it('honors custom formatResult on success', async () => {
    const customFormat = spyWith((callId: string, result: unknown) => ({
      type: 'function_call_output' as const,
      call_id: callId,
      output: `custom:${JSON.stringify(result)}`,
    }))

    const { toolResults } = await run({
      toolCalls: [call('my_tool')],
      tools: [tool('my_tool', () => ({ ok: true }), customFormat)],
    })

    expect(customFormat.calls).toHaveLength(1)
    expect(toolResults[0].output).toBe('custom:{"ok":true}')
  })

  it('handles async-generator executor, returns final result', async () => {
    const gen = () => generator(['event_1', 'event_2'], { final: true })

    const onAfterCall = spy<[OpenAIFunctionCall, unknown]>()
    const { toolResults } = await run({
      toolCalls: [call('my_tool')],
      tools: [tool('my_tool', gen)],
      onAfterCall,
    })

    expect(JSON.parse(toolResults[0].output)).toEqual({ final: true })
    expect(onAfterCall.calls).toHaveLength(1)
    expect(onAfterCall.calls[0][1]).toEqual({ final: true })
  })

  it('returns error result for unknown tool, calls onCallError, skips onAfterCall', async () => {
    const onCallError = spy<[OpenAIFunctionCall, Error]>()
    const onAfterCall = spy<[OpenAIFunctionCall, unknown]>()
    const toolCall = call('missing_tool')

    const { toolResults } = await run({
      toolCalls: [toolCall],
      tools: [],
      onCallError,
      onAfterCall,
    })

    expect(JSON.parse(toolResults[0].output)).toEqual({ error: 'Unknown tool: missing_tool' })
    expect(onCallError.calls).toHaveLength(1)
    expect(onCallError.calls[0][0]).toBe(toolCall)
    expect(onCallError.calls[0][1]).toBeInstanceOf(Error)
    const unknownToolError = onCallError.calls[0][1]
    expect(() => {
      throw unknownToolError
    }).toThrow(/^Unknown tool: missing_tool$/)
    expect(onAfterCall.calls).toHaveLength(0)
  })

  it('returns error result for invalid JSON arguments, calls onCallError, skips onAfterCall', async () => {
    const onCallError = spy<[OpenAIFunctionCall, Error]>()
    const onAfterCall = spy<[OpenAIFunctionCall, unknown]>()

    const { toolResults } = await run({
      toolCalls: [{ type: 'function_call', call_id: 'c', name: 'my_tool', arguments: '{invalid' }],
      tools: [tool('my_tool', () => 'should not run')],
      onCallError,
      onAfterCall,
    })

    expect(JSON.parse(toolResults[0].output)).toEqual({
      error: 'Invalid JSON arguments for tool my_tool',
    })
    expect(onCallError.calls).toHaveLength(1)
    expect(onCallError.calls[0][1]).toBeInstanceOf(Error)
    expect(onAfterCall.calls).toHaveLength(0)
  })

  it('returns error result for executor throw, bypasses custom formatResult, skips onAfterCall', async () => {
    const onCallError = spy<[OpenAIFunctionCall, Error]>()
    const onAfterCall = spy<[OpenAIFunctionCall, unknown]>()
    const customFormat = spyWith((_callId: string, _result: unknown) => ({
      type: 'function_call_output' as const,
      call_id: _callId,
      output: '',
    }))

    const { toolResults } = await run({
      toolCalls: [call('my_tool')],
      tools: [
        tool(
          'my_tool',
          () => {
            throw new Error('boom')
          },
          customFormat,
        ),
      ],
      onCallError,
      onAfterCall,
    })

    expect(JSON.parse(toolResults[0].output)).toEqual({ error: 'boom' })
    expect(customFormat.calls).toHaveLength(0)
    expect(onCallError.calls).toHaveLength(1)
    const callError = onCallError.calls[0][1]
    expect(() => {
      throw callError
    }).toThrow(/^boom$/)
    expect(onAfterCall.calls).toHaveLength(0)
  })

  it('wraps non-Error executor rejections into an Error', async () => {
    const onCallError = spy<[OpenAIFunctionCall, Error]>()

    const { toolResults } = await run({
      toolCalls: [call('my_tool')],
      // Rejected promise with a non-Error value exercises the wrapping branch
      // oxlint-disable-next-line typescript/prefer-promise-reject-errors -- External tool handlers may reject with primitive values.
      tools: [tool('my_tool', () => Promise.reject('raw string error'))],
      onCallError,
    })

    expect(JSON.parse(toolResults[0].output)).toEqual({ error: 'raw string error' })
    expect(onCallError.calls[0][1]).toBeInstanceOf(Error)
    const rejectionError = onCallError.calls[0][1]
    expect(() => {
      throw rejectionError
    }).toThrow(/^raw string error$/)
  })

  it('handles onBeforeCall skip with default skipResult, does not call onAfterCall', async () => {
    const onAfterCall = spy<[OpenAIFunctionCall, unknown]>()
    const onCallError = spy<[OpenAIFunctionCall, Error]>()
    const toolCall = call('my_tool')

    const { toolResults } = await run({
      toolCalls: [toolCall],
      tools: [tool('my_tool', () => 'should not run')],
      onBeforeCall: () => ({ skip: true }),
      onAfterCall,
      onCallError,
    })

    expect(JSON.parse(toolResults[0].output)).toEqual({ skipped: true })
    expect(onAfterCall.calls).toHaveLength(0)
    expect(onCallError.calls).toHaveLength(0)
  })

  it('handles onBeforeCall skip with custom skipResult', async () => {
    const skipResult = { skipped: true, reason: 'max_reached' }

    const { toolResults } = await run({
      toolCalls: [call('my_tool')],
      tools: [tool('my_tool', () => 'should not run')],
      onBeforeCall: () => ({ skip: true, skipResult }),
    })

    expect(JSON.parse(toolResults[0].output)).toEqual(skipResult)
  })

  it('handles multiple tool calls and preserves result order', async () => {
    const { toolResults } = await run({
      toolCalls: [call('a', undefined, 'id_a'), call('b', undefined, 'id_b')],
      tools: [tool('a', () => 'result_a'), tool('b', () => 'result_b')],
    })

    expect(toolResults).toHaveLength(2)
    expect(JSON.parse(toolResults[0].output)).toBe('result_a')
    expect(JSON.parse(toolResults[1].output)).toBe('result_b')
  })
})
