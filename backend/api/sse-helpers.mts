import type { Context } from '@jongleberry/api-server'
import { PassThrough } from 'node:stream'
import type { ChannelSubscription } from '@data-stores/valkey-pubsub'
import onError from '@modules/on-error'
import { CHAT_SSE_CYCLE_EXPIRED } from '@agents/chat/stream-lifecycle'

export const DEFAULT_SSE_CYCLE_DURATION_MS = 60_000
export const MAX_SSE_CYCLE_DURATION_MS = 120_000

export type SSEContext = {
  stream: PassThrough
  pipelinePromise: Promise<void>
  lifecycleSignal: AbortSignal
}

export type PreSSEAbortWatcher = {
  wasAborted: () => boolean
  stop: () => void
}

type ClosableSSEResource = {
  close: () => void | Promise<void>
}

export type ManagedSSECycleResource<T extends ClosableSSEResource> = {
  resource: T
  close: () => Promise<void>
}

export async function acquireDuringSSECycle<T extends ClosableSSEResource>(
  signal: AbortSignal,
  acquire: () => Promise<T>,
): Promise<ManagedSSECycleResource<T> | undefined> {
  if (signal.aborted) return undefined
  const resource = await acquire()
  let closePromise: Promise<void> | undefined
  const closeResource = () => {
    closePromise ??= Promise.resolve().then(() => resource.close())
    return closePromise
  }
  const closeOnAbort = () => {
    void closeResource().catch(onError)
  }

  if (signal.aborted) {
    await closeResource()
    return undefined
  }
  signal.addEventListener('abort', closeOnAbort, { once: true })

  return {
    resource,
    close: async () => {
      signal.removeEventListener('abort', closeOnAbort)
      await closeResource()
    },
  }
}

export function watchForAbortBeforeSSE(
  signal: AbortSignal,
  closeSubscription: () => void,
): PreSSEAbortWatcher {
  let aborted = false
  function handleAbort() {
    aborted = true
    closeSubscription()
  }

  if (signal.aborted) {
    handleAbort()
  } else {
    signal.addEventListener('abort', handleAbort, { once: true })
  }

  return {
    wasAborted: () => aborted,
    stop: () => signal.removeEventListener('abort', handleAbort),
  }
}

export function startSSE(ctx: Context, options: { cycleDurationMs?: number } = {}): SSEContext {
  const cycleDurationMs = options.cycleDurationMs ?? DEFAULT_SSE_CYCLE_DURATION_MS
  if (cycleDurationMs > MAX_SSE_CYCLE_DURATION_MS) {
    throw new RangeError(`SSE cycle duration must not exceed ${MAX_SSE_CYCLE_DURATION_MS} ms`)
  }

  ctx.setType('text/event-stream')
  ctx.set('Cache-Control', 'no-cache')
  ctx.set('Connection', 'keep-alive')
  ctx.set('X-Accel-Buffering', 'no')

  const stream = new PassThrough()
  // Client disconnect causes pipeline to reject; suppress it here since disconnect is
  // expected for SSE — callers rely on ctx.signal to detect it. Non-disconnect
  // errors are still routed through onError so transport failures don't disappear silently.
  const lifecycle = new AbortController()
  const endCycle = (reason?: unknown) => {
    lifecycle.abort(reason)
    if (!stream.destroyed && !stream.writableEnded) stream.end()
  }
  const endOnDisconnect = () => {
    lifecycle.abort()
    if (!stream.destroyed && !stream.writableEnded) stream.end()
  }
  let cycleTimer: ReturnType<typeof setTimeout> | undefined
  if (ctx.signal.aborted) {
    endCycle()
  } else {
    ctx.signal.addEventListener('abort', endOnDisconnect, { once: true })
    cycleTimer = setTimeout(() => endCycle(CHAT_SSE_CYCLE_EXPIRED), cycleDurationMs)
    cycleTimer.unref()
  }

  const pipelinePromise = ctx
    .pipeline(stream)
    .catch((err: NodeJS.ErrnoException) => {
      if (err?.code === 'ERR_STREAM_PREMATURE_CLOSE' || err?.code === 'ECONNRESET') return
      onError(err)
    })
    .finally(() => {
      if (cycleTimer !== undefined) clearTimeout(cycleTimer)
      ctx.signal.removeEventListener('abort', endOnDisconnect)
      lifecycle.abort()
    })

  // Disable Nagle so small SSE writes flush immediately to the client
  ctx.res.socket?.setNoDelay(true)

  return { stream, pipelinePromise, lifecycleSignal: lifecycle.signal }
}

export function pipeChannelToSSE<T>(options: {
  ctx: Context
  stream: PassThrough
  subscription: ChannelSubscription<T>
  eventName: string
  abortSignal: AbortSignal
  isTerminal?: (value: T) => boolean
  initialValue?: T
}): Promise<void> {
  const { stream, subscription, eventName, abortSignal, isTerminal, initialValue } = options

  if (abortSignal.aborted) {
    subscription.setHandler(null)
    return Promise.resolve()
  }

  if (initialValue !== undefined) {
    try {
      stream.write(`event: ${eventName}\ndata: ${JSON.stringify(initialValue)}\n\n`)
    } catch {
      // client gone
    }
    if (isTerminal?.(initialValue)) {
      subscription.setHandler(null)
      return Promise.resolve()
    }
  }

  return new Promise<void>(resolve => {
    let settled = false
    function settle(): void {
      if (settled) return
      settled = true
      abortSignal.removeEventListener('abort', settle)
      subscription.setHandler(null)
      resolve()
    }

    abortSignal.addEventListener('abort', settle, { once: true })
    if (abortSignal.aborted) {
      settle()
      return
    }

    subscription.setHandler((value: T) => {
      if (settled) return
      try {
        stream.write(`event: ${eventName}\ndata: ${JSON.stringify(value)}\n\n`)
      } catch {
        // client gone
      }
      if (isTerminal?.(value)) settle()
    })
  })
}
