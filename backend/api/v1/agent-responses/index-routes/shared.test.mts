import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  AGENT_RESPONSE_START_FAILED_ERROR,
  formatAgentEventAsSSE,
  persistAndReportAgentResponseStartFailure,
  pipeAgentResponseEventsToSSE,
} from './shared.mts'
import type { AgentResponseEvent, AgentResponseSubscription } from '@data-stores/valkey-pubsub'

function makeSubscription(): AgentResponseSubscription & {
  emit: (chunk: AgentResponseEvent) => void
} {
  let handler: ((chunk: AgentResponseEvent) => void) | null = null
  return {
    setHandler(h: ((chunk: AgentResponseEvent) => void) | null) {
      handler = h
    },
    close: vi.fn<() => void>(),
    emit(chunk: AgentResponseEvent) {
      handler?.(chunk)
    },
  } as unknown as AgentResponseSubscription & {
    emit: (chunk: AgentResponseEvent) => void
  }
}

const serializerCases = {
  progress: {
    event: { type: 'progress', content: 'hello' },
    expectedEvent: 'event: progress',
    expectedPayload: '"content":"hello"',
  },
  summary: {
    event: { type: 'summary', content: 'sum' },
    expectedEvent: 'event: summary',
    expectedPayload: '"content":"sum"',
  },
  done: {
    event: { type: 'done', content: 'fin' },
    expectedEvent: 'event: done',
    expectedPayload: '"content":"fin"',
  },
  error: {
    event: { type: 'error', error: 'oops' },
    expectedEvent: 'event: error',
    expectedPayload: '"error":"oops"',
  },
} satisfies Record<
  AgentResponseEvent['type'],
  { event: AgentResponseEvent; expectedEvent: string; expectedPayload: string }
>
describe('formatAgentEventAsSSE', () => {
  it('returns null when type is missing', () => {
    expect(formatAgentEventAsSSE({} as unknown as AgentResponseEvent)).toBeNull()
  })

  it('returns null for non-object runtime payloads', () => {
    expect(formatAgentEventAsSSE(null as unknown as AgentResponseEvent)).toBeNull()
    expect(formatAgentEventAsSSE('progress' as unknown as AgentResponseEvent)).toBeNull()
  })

  it.each(Object.values(serializerCases))(
    'formats $expectedEvent',
    ({ event, expectedEvent, expectedPayload }) => {
      const result = formatAgentEventAsSSE(event)
      expect(result).toContain(expectedEvent)
      expect(result).toContain(expectedPayload)
    },
  )

  it('formats progress event with tool_name', () => {
    const result = formatAgentEventAsSSE({ type: 'progress', tool_name: 'search_topics' })
    expect(result).toContain('event: progress')
    expect(result).toContain('"tool_name":"search_topics"')
  })

  it('formats error event with default message when error field absent', () => {
    const result = formatAgentEventAsSSE({ type: 'error' })
    expect(result).toContain('"error":"Unknown error"')
  })

  it('formats summary event with empty content when content absent', () => {
    const result = formatAgentEventAsSSE({ type: 'summary' })
    expect(result).toContain('"content":""')
  })

  it('returns null for unknown event type', () => {
    expect(
      formatAgentEventAsSSE({ type: 'unknown_type' } as unknown as AgentResponseEvent),
    ).toBeNull()
  })

  it('throws if a payload changes type after passing the runtime guard', () => {
    const event = new Proxy({ type: 'progress' } as Record<string, unknown>, {
      get(target, prop, receiver) {
        if (prop === 'type') {
          const value = target.type
          target.type = 'mutated'
          return value
        }
        return Reflect.get(target, prop, receiver)
      },
    }) as unknown as AgentResponseEvent

    expect(() => formatAgentEventAsSSE(event)).toThrow('Unhandled agent response event')
  })
})

describe('pipeAgentResponseEventsToSSE', () => {
  let write: ReturnType<typeof vi.fn<(data: string) => void>>

  beforeEach(() => {
    write = vi.fn<(data: string) => void>()
  })

  it('resolves immediately when disconnect signal is already aborted', async () => {
    const subscription = makeSubscription()
    const controller = new AbortController()
    controller.abort()

    await pipeAgentResponseEventsToSSE({
      subscription,
      write,
      lifecycleSignal: controller.signal,
    })

    expect(write).not.toHaveBeenCalled()
  })

  it('settles when lifecycle expiry is visible on the post-listener recheck', async () => {
    const subscription = makeSubscription()
    let abortedReads = 0
    const lifecycleSignal = {
      get aborted() {
        abortedReads += 1
        return abortedReads > 1
      },
      addEventListener: vi.fn<VitestLooseMock>(),
      removeEventListener: vi.fn<VitestLooseMock>(),
    } as unknown as AbortSignal

    await pipeAgentResponseEventsToSSE({
      subscription,
      write,
      lifecycleSignal,
    })

    expect(write).not.toHaveBeenCalled()
  })

  it('settles on done event from subscription', async () => {
    const subscription = makeSubscription()
    const controller = new AbortController()

    const promise = pipeAgentResponseEventsToSSE({
      subscription,
      write,
      lifecycleSignal: controller.signal,
    })

    subscription.emit({ type: 'done', content: 'Result' })
    await promise

    expect(write).toHaveBeenCalledWith(expect.stringContaining('event: done'))
  })

  it('settles on error event from subscription', async () => {
    const subscription = makeSubscription()
    const controller = new AbortController()

    const promise = pipeAgentResponseEventsToSSE({
      subscription,
      write,
      lifecycleSignal: controller.signal,
    })

    subscription.emit({ type: 'error', error: 'something went wrong' })
    await promise

    expect(write).toHaveBeenCalledWith(expect.stringContaining('event: error'))
  })

  it('settles without writing an error when lifecycle signal fires', async () => {
    const subscription = makeSubscription()
    const controller = new AbortController()

    const promise = pipeAgentResponseEventsToSSE({
      subscription,
      write,
      lifecycleSignal: controller.signal,
    })

    controller.abort()
    await promise

    expect(write).not.toHaveBeenCalled()
  })

  it('settles when replay aborts synchronously during handler registration', async () => {
    const controller = new AbortController()
    let handler: ((chunk: AgentResponseEvent) => void) | null = null
    const subscription: AgentResponseSubscription = {
      setHandler(nextHandler) {
        handler = nextHandler
        if (nextHandler) controller.abort()
      },
      close: vi.fn<VitestLooseMock>(),
    }

    await pipeAgentResponseEventsToSSE({
      subscription,
      write,
      lifecycleSignal: controller.signal,
    })

    expect(handler).toBeNull()
  })

  it('ignores chunks after settled', async () => {
    const subscription = makeSubscription()
    const controller = new AbortController()

    const promise = pipeAgentResponseEventsToSSE({
      subscription,
      write,
      lifecycleSignal: controller.signal,
    })

    subscription.emit({ type: 'done', content: 'first' })
    subscription.emit({ type: 'done', content: 'second' })
    await promise

    const doneCalls = write.mock.calls.filter(c => c[0]?.includes('event: done'))
    expect(doneCalls.length).toBe(1)
  })
})

describe('persistAndReportAgentResponseStartFailure', () => {
  it('persists a public error and closes committed SSE without rethrowing the internal error', async () => {
    const persistFailure = vi.fn<(error: string) => Promise<boolean>>().mockResolvedValue(true)
    const write = vi.fn<(data: string) => void>()
    const reportError = vi.fn<(error: Error) => void>()

    await expect(
      persistAndReportAgentResponseStartFailure({
        error: new Error('internal queue detail'),
        persistFailure,
        write,
        lifecycleSignal: new AbortController().signal,
        reportError,
      }),
    ).resolves.toBe(true)

    expect(reportError).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'internal queue detail' }),
    )
    expect(persistFailure).toHaveBeenCalledWith(AGENT_RESPONSE_START_FAILED_ERROR)
    expect(write).toHaveBeenCalledWith(expect.stringContaining(AGENT_RESPONSE_START_FAILED_ERROR))
  })

  it('replays the worker terminal event when the worker wins the CAS', async () => {
    const write = vi.fn<(data: string) => void>()
    const subscription: AgentResponseSubscription = {
      setHandler(handler) {
        handler?.({ type: 'done', content: 'Worker result' })
      },
      close: vi.fn<VitestLooseMock>(),
    }

    await expect(
      persistAndReportAgentResponseStartFailure({
        error: new Error('ambiguous enqueue'),
        persistFailure: vi.fn<VitestLooseMock>().mockResolvedValue(false),
        write,
        lifecycleSignal: new AbortController().signal,
        subscription,
        reportError: vi.fn<VitestLooseMock>(),
      }),
    ).resolves.toBe(false)

    expect(write).toHaveBeenCalledWith(expect.stringContaining('event: done'))
    expect(write).not.toHaveBeenCalledWith(
      expect.stringContaining(AGENT_RESPONSE_START_FAILED_ERROR),
    )
  })

  it('ends quietly when acquisition fails after another terminal transition wins', async () => {
    await expect(
      persistAndReportAgentResponseStartFailure({
        error: new Error('subscription unavailable'),
        persistFailure: vi.fn<VitestLooseMock>().mockResolvedValue(false),
        write: vi.fn<VitestLooseMock>(),
        lifecycleSignal: new AbortController().signal,
        reportError: vi.fn<VitestLooseMock>(),
      }),
    ).resolves.toBe(false)
  })
})
