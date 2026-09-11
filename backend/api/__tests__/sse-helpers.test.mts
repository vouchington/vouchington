import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PassThrough } from 'node:stream'
import { acquireDuringSSECycle, pipeChannelToSSE, watchForAbortBeforeSSE } from '../sse-helpers.mts'
import type { Context } from '@jongleberry/api-server'
import type { ChannelSubscription } from '@data-stores/valkey-pubsub'

function makeCtx(overrides?: Partial<Context>): Context {
  const socket = { setNoDelay: vi.fn<() => void>() }
  const res = {
    on: vi.fn<VitestLooseMock>(),
    writableEnded: false,
    socket,
  }
  return {
    setType: vi.fn<VitestLooseMock>(),
    set: vi.fn<VitestLooseMock>(),
    pipeline: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    res,
    ...overrides,
  } as unknown as Context
}

function makeSub<T>(onSetHandler?: () => void): {
  sub: ChannelSubscription<T>
  triggerMessage: (value: T) => void
  getHandler: () => ((value: T) => void) | null
} {
  let handler: ((value: T) => void) | null = null
  const sub: ChannelSubscription<T> = {
    setHandler(fn) {
      handler = fn
      if (fn) onSetHandler?.()
    },
    close: vi.fn<() => void>(),
  }
  return {
    sub,
    triggerMessage: (value: T) => handler?.(value),
    getHandler: () => handler,
  }
}

describe('acquireDuringSSECycle', () => {
  it('closes a subscription acquired after the lifecycle expires', async () => {
    const lifecycle = new AbortController()
    const closed = Promise.withResolvers<void>()
    const close = vi.fn<() => void>(() => closed.resolve())
    const subscription = Promise.withResolvers<{ close: () => void }>()
    const acquired = acquireDuringSSECycle(lifecycle.signal, () => subscription.promise)
    lifecycle.abort()
    subscription.resolve({ close })

    await expect(acquired).resolves.toBeUndefined()
    await closed.promise
    expect(close).toHaveBeenCalledOnce()
  })

  it('closes an acquired subscription while later setup is still pending', async () => {
    const lifecycle = new AbortController()
    const closed = Promise.withResolvers<void>()
    const close = vi.fn<() => void>(() => closed.resolve())
    const managed = await acquireDuringSSECycle(lifecycle.signal, async () => ({ close }))
    const laterSetup = Promise.withResolvers<void>()
    let laterSetupFinished = false
    const pendingSetup = laterSetup.promise.then(() => {
      laterSetupFinished = true
      return undefined
    })
    lifecycle.abort()
    await closed.promise

    expect(close).toHaveBeenCalledOnce()
    expect(laterSetupFinished).toBe(false)

    laterSetup.resolve()
    await pendingSetup
    await managed?.close()
    expect(close).toHaveBeenCalledOnce()
  })
})

describe('pipeChannelToSSE', () => {
  let stream: PassThrough
  let written: string[]
  let ctx: Context

  beforeEach(() => {
    stream = new PassThrough()
    written = []
    stream.on('data', (chunk: Buffer) => written.push(chunk.toString()))
    ctx = makeCtx()
  })

  it('stops the subscription on lifecycle expiry without writing a named error', async () => {
    const { sub, getHandler } = makeSub<string>()
    const lifecycle = new AbortController()
    const promise = pipeChannelToSSE({
      ctx,
      stream,
      subscription: sub,
      eventName: 'snapshot',
      abortSignal: lifecycle.signal,
    })

    lifecycle.abort()
    await promise

    expect(getHandler()).toBeNull()
    expect(written.join('')).not.toContain('event: error')
  })

  it('does not write a delayed initial snapshot after the lifecycle expires', async () => {
    const { sub } = makeSub<{ status: string }>()
    const abort = new AbortController()
    const delayedSnapshot = Promise.withResolvers<{ status: string }>()
    abort.abort()
    delayedSnapshot.resolve({ status: 'pending' })

    await pipeChannelToSSE({
      ctx,
      stream,
      subscription: sub,
      eventName: 'state',
      abortSignal: abort.signal,
      initialValue: await delayedSnapshot.promise,
    })

    expect(written).toEqual([])
  })

  it('writes initialValue as SSE event immediately while active', async () => {
    const { sub } = makeSub<{ status: string }>()
    const abort = new AbortController()
    const promise = pipeChannelToSSE({
      ctx,
      stream,
      subscription: sub,
      eventName: 'state',
      abortSignal: abort.signal,
      initialValue: { status: 'pending' },
    })
    abort.abort()
    await promise
    expect(written.join('')).toContain('event: state')
  })

  it('returns immediately when initialValue matches isTerminal', async () => {
    const { sub } = makeSub<{ status: string }>()
    const abort = new AbortController()

    await pipeChannelToSSE({
      ctx,
      stream,
      subscription: sub,
      eventName: 'state',
      abortSignal: abort.signal,
      isTerminal: s => s.status === 'ready',
      initialValue: { status: 'ready' },
    })

    // Should resolve without waiting for abort
    expect(abort.signal.aborted).toBe(false)
    expect(written.join('')).toContain('event: state')
  })

  it('forwards pub/sub messages as SSE events', async () => {
    const { sub, triggerMessage } = makeSub<{ v: number }>()
    const abort = new AbortController()

    const pipePromise = pipeChannelToSSE({
      ctx,
      stream,
      subscription: sub,
      eventName: 'update',
      abortSignal: abort.signal,
    })

    triggerMessage({ v: 1 })
    triggerMessage({ v: 2 })
    abort.abort()

    await pipePromise

    const text = written.join('')
    expect(text).toContain(`event: update\ndata: ${JSON.stringify({ v: 1 })}\n\n`)
    expect(text).toContain(`event: update\ndata: ${JSON.stringify({ v: 2 })}\n\n`)
  })

  it('settles when a terminal message is received', async () => {
    const { sub, triggerMessage } = makeSub<{ status: string }>()
    const abort = new AbortController()

    const pipePromise = pipeChannelToSSE({
      ctx,
      stream,
      subscription: sub,
      eventName: 'status',
      abortSignal: abort.signal,
      isTerminal: s => s.status === 'done',
    })

    triggerMessage({ status: 'processing' })
    triggerMessage({ status: 'done' })

    await pipePromise
    expect(abort.signal.aborted).toBe(false)
  })

  it('resolves immediately when abortSignal is already aborted', async () => {
    const { sub } = makeSub<string>()
    const abort = new AbortController()
    abort.abort()

    await expect(
      pipeChannelToSSE({
        ctx,
        stream,
        subscription: sub,
        eventName: 'x',
        abortSignal: abort.signal,
      }),
    ).resolves.toBeUndefined()
  })

  it('calls subscription.setHandler(null) on resolve', async () => {
    const { sub, triggerMessage, getHandler } = makeSub<{ status: string }>()
    const abort = new AbortController()

    const pipePromise = pipeChannelToSSE({
      ctx,
      stream,
      subscription: sub,
      eventName: 'status',
      abortSignal: abort.signal,
      isTerminal: s => s.status === 'done',
    })

    triggerMessage({ status: 'done' })
    await pipePromise

    expect(getHandler()).toBeNull()
  })

  it('settles when handler registration synchronously aborts', async () => {
    const abort = new AbortController()
    const { sub, getHandler } = makeSub<string>(() => abort.abort())

    await pipeChannelToSSE({
      ctx,
      stream,
      subscription: sub,
      eventName: 'x',
      abortSignal: abort.signal,
    })
    expect(getHandler()).toBeNull()
  })
})

describe('watchForAbortBeforeSSE', () => {
  it('closes immediately when the signal is already aborted', () => {
    const abort = new AbortController()
    abort.abort()
    let closeCalls = 0

    const watcher = watchForAbortBeforeSSE(abort.signal, () => closeCalls++)

    expect(watcher.wasAborted()).toBe(true)
    expect(closeCalls).toBe(1)
    watcher.stop()
  })

  it('closes when a live signal aborts and can be stopped first', () => {
    const abort = new AbortController()
    let closeCalls = 0
    const watcher = watchForAbortBeforeSSE(abort.signal, () => closeCalls++)

    expect(watcher.wasAborted()).toBe(false)
    abort.abort()
    expect(watcher.wasAborted()).toBe(true)
    expect(closeCalls).toBe(1)

    const stoppedAbort = new AbortController()
    const stoppedWatcher = watchForAbortBeforeSSE(stoppedAbort.signal, () => closeCalls++)
    stoppedWatcher.stop()
    stoppedAbort.abort()
    expect(stoppedWatcher.wasAborted()).toBe(false)
    expect(closeCalls).toBe(1)
  })
})
