import { describe, it, expect, vi } from 'vitest'

import { streamOpenAIToolLoop } from '../openai-tool-loop-stream.mts'

import type { PrivateUser } from '@services/users/types'
import type { RunToolLoopConfig, RunToolLoopResult } from '@agents/_shared'
import type { ChatHistoryMessage } from '../build-input.mts'

function makePrivateUser(id: string): PrivateUser {
  return { __entity_type: 'user', id, roles: [] } as unknown as PrivateUser
}

function makeRunner(result: RunToolLoopResult) {
  return vi.fn<VitestLooseMock>().mockImplementation(async function* () {
    yield* []
    return result
  })
}

async function drain<T>(gen: AsyncGenerator<unknown, T>): Promise<T> {
  let step = await gen.next()
  while (!step.done) step = await gen.next()
  return step.value
}

describe('streamOpenAIToolLoop', () => {
  it('maps typed chat history to native OpenAI response input items', async () => {
    const runLoopStreaming = makeRunner({
      text: 'answer',
      iterations: 1,
      terminationReason: 'no_tool_calls',
      lastResponseId: 'resp-typed',
    })
    const input: ChatHistoryMessage[] = [
      { role: 'user', content: 'Question' },
      { role: 'assistant', content: 'Answer' },
    ]

    await drain(
      streamOpenAIToolLoop({
        conversationId: 'conv-typed',
        conversationMessageId: 'msg-typed',
        agenticRunId: 'run-typed',
        currentUser: makePrivateUser('user-typed'),
        previousResponseId: undefined,
        input,
        runLoopStreaming,
      }),
    )

    const config = runLoopStreaming.mock.calls[0]?.[0] as RunToolLoopConfig
    expect(config.input).toEqual([
      { type: 'message', role: 'user', content: 'Question' },
      { type: 'message', role: 'assistant', content: 'Answer' },
    ])
    expect(config.previousResponseId).toBeUndefined()
    expect(config.instructions).toEqual(expect.any(String))
  })

  it('sends only the current typed user turn with a previous response id', async () => {
    const runLoopStreaming = makeRunner({
      text: 'continued',
      iterations: 1,
      terminationReason: 'no_tool_calls',
      lastResponseId: 'resp-next',
    })

    await drain(
      streamOpenAIToolLoop({
        conversationId: 'conv-continuation',
        conversationMessageId: 'msg-continuation',
        agenticRunId: 'run-continuation',
        currentUser: makePrivateUser('user-continuation'),
        previousResponseId: 'resp-prior',
        input: [{ role: 'user', content: 'Follow up' }],
        runLoopStreaming,
      }),
    )

    const config = runLoopStreaming.mock.calls[0]?.[0] as RunToolLoopConfig
    expect(config.input).toEqual([{ type: 'message', role: 'user', content: 'Follow up' }])
    expect(config.previousResponseId).toBe('resp-prior')
  })

  it('passes CHAT_OPENAI_MAX_RETRIES through to runLoopStreaming config', async () => {
    const runLoopStreaming = makeRunner({
      text: 'hi',
      iterations: 1,
      terminationReason: 'no_tool_calls',
      lastResponseId: 'resp-1',
    })

    await drain(
      streamOpenAIToolLoop({
        conversationId: 'conv-1',
        conversationMessageId: 'msg-1',
        agenticRunId: 'run-1',
        currentUser: makePrivateUser('user-1'),
        previousResponseId: undefined,
        input: [{ role: 'user', content: 'hello' }],
        runLoopStreaming,
      }),
    )

    // Bounded to ride out transient flex-tier 429 load-shedding without pausing
    // the whole ai-agents worker — see rate-limit.mts and issue #8077.
    const config = runLoopStreaming.mock.calls[0]?.[0] as RunToolLoopConfig
    expect(config.maxRetries).toBe(5)
    expect(typeof config.maxRetries).toBe('number')
  })
})
