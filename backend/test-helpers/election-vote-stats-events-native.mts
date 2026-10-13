import { fork, type ChildProcess } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { Queue } from 'glide-mq'
import { onTestFinished } from 'vitest'
import { workerQueueConnection, workerQueuePrefix } from '../data-stores/valkey-glide-mq/index.mts'
import { observeElectionQueueTerminals } from './election-vote-stats-events.mts'

type Receipt = { type: 'completed' | 'failed'; id: string; pid: number }

/** A separate Node process owns the sole Worker; the test owns only its queue and stream. */
export async function acquireNativeElectionEventFixture() {
  const name = `election_terminal_${randomUUID()}`
  const options = { connection: workerQueueConnection, prefix: workerQueuePrefix }
  let queue: Queue | undefined
  let observer: ReturnType<typeof observeElectionQueueTerminals> | undefined
  let child: ChildProcess | undefined
  let exit: Promise<{ code: number | null; signal: NodeJS.Signals | null }> | undefined
  let closing: Promise<void> | undefined
  let stopped: Promise<{ code: number | null; signal: NodeJS.Signals | null }> | undefined
  let ended = false
  let failure: unknown
  let hasFailure = false
  const failures: unknown[] = []
  const ready = Promise.withResolvers<number>()
  void ready.promise.catch(() => {})
  const receipts = new Map<string, Receipt>()
  const waits = new Map<string, PromiseWithResolvers<Receipt>>()
  const writes: Array<Promise<Awaited<ReturnType<Queue['add']>>>> = []
  const reject = (error: unknown, retain = true) => {
    if (retain) failures.push(error)
    failure = error
    hasFailure = true
    ready.reject(error)
    for (const wait of waits.values()) wait.reject(error)
    waits.clear()
  }
  const assertOpen = () => {
    if (closing || ended) throw new Error('Owned native fixture is closed')
    if (hasFailure) throw failure
  }
  const prepared = Promise.resolve().then(async () => {
    assertOpen()
    queue = new Queue(name, options)
    observer = observeElectionQueueTerminals(name, options)
    await observer.ready()
    assertOpen()
    child = fork(new URL('./election-vote-stats-events-child.mts', import.meta.url), [], {
      stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
    })
    const exitReceipt = Promise.withResolvers<{
      code: number | null
      signal: NodeJS.Signals | null
    }>()
    exit = exitReceipt.promise
    child.once('error', error => reject(error))
    child.once('close', (code, signal) => {
      ended = true
      exitReceipt.resolve({ code, signal })
      const error = new Error(`Owned worker exited (${code}, ${signal})`)
      reject(error, false)
    })
    child.on('message', message => {
      if (!message || typeof message !== 'object' || !('pid' in message)) {
        reject(new Error('Malformed owned worker receipt'))
        return
      }
      if (message.pid !== child?.pid) {
        reject(new Error('Owned worker PID mismatch'))
        return
      }
      if ('type' in message && message.type === 'ready') ready.resolve(message.pid as number)
      else if (
        'type' in message &&
        (message.type === 'completed' || message.type === 'failed') &&
        'id' in message &&
        typeof message.id === 'string' &&
        message.id.length > 0
      ) {
        const receipt: Receipt = { type: message.type, id: message.id, pid: message.pid as number }
        receipts.set(receipt.id, receipt)
        waits.get(receipt.id)?.resolve(receipt)
        waits.delete(receipt.id)
      } else reject(new Error('Malformed owned worker receipt'))
    })
    await send({ name, options })
    return ready.promise
  })
  void prepared.catch(() => {})
  const close = () => (closing ??= dispose())
  onTestFinished(close)
  try {
    await prepared
    if (closing) throw new Error('Owned native fixture is closing')
    return {
      observer: observer!,
      workerPid: await ready.promise,
      stopWorker,
      add(name: string, options?: Parameters<Queue['add']>[2]) {
        if (closing) throw new Error('Owned native fixture is closed')
        const write = Promise.resolve().then(() => {
          if (closing) throw new Error('Owned native fixture is closed')
          return queue!.add(name, {}, options)
        })
        writes.push(write)
        void write.catch(() => {})
        return write
      },
      receipt(id: string): Promise<Receipt> {
        if (!id) return Promise.reject(new Error('A concrete owned job ID is required'))
        if (closing || ended) return Promise.reject(new Error('Owned native fixture is closed'))
        if (hasFailure)
          return Promise.reject(
            failure instanceof Error
              ? failure
              : new Error('Owned worker failed', { cause: failure }),
          )
        const known = receipts.get(id)
        if (known) return Promise.resolve(known)
        const wait = waits.get(id) ?? Promise.withResolvers<Receipt>()
        void wait.promise.catch(() => {})
        waits.set(id, wait)
        return wait.promise
      },
      close,
    }
  } catch (err) {
    const [result] = await Promise.allSettled([close()])
    if (result?.status === 'rejected')
      throw new AggregateError([err, result.reason], 'Native fixture setup and cleanup failed', {
        cause: err,
      })
    throw err
  }

  function send(message: object | string) {
    return new Promise<void>((resolve, reject) => {
      if (!child?.connected) return reject(new Error('Owned worker IPC is disconnected'))
      child.send(message, error => (error ? reject(error) : resolve()))
    })
  }
  function stopWorker() {
    return (stopped ??= stop())
  }
  async function stop() {
    if (child?.connected) await send('close')
    if (!exit) throw new Error('Owned worker has no registered exit receipt')
    const result = await exit
    if (result.code !== 0 || result.signal)
      throw new Error(`Owned worker did not exit normally (${result.code}, ${result.signal})`)
    return result
  }
  async function dispose() {
    const errors: unknown[] = []
    const attempt = async (action: () => unknown) => {
      try {
        await action()
      } catch (err) {
        errors.push(err)
      }
    }
    await Promise.allSettled([prepared])
    for (const write of writes) {
      const [result] = await Promise.allSettled([write])
      if (result?.status === 'rejected') errors.push(result.reason)
    }
    for (const wait of waits.values()) wait.reject(new Error('Owned native fixture is closed'))
    waits.clear()
    if (child?.connected) await attempt(() => send('close'))
    let workerExited = child === undefined
    if (exit) {
      const result = await exit
      workerExited = true
      if (result.code !== 0 || result.signal)
        errors.push(
          new Error(`Owned worker did not exit normally (${result.code}, ${result.signal})`),
        )
    }
    await attempt(() => observer?.close())
    if (workerExited && queue) await attempt(() => queue!.obliterate({ force: true }))
    await attempt(() => queue?.close())
    errors.unshift(...failures)
    if (errors.length)
      throw new AggregateError(errors, 'Native fixture cleanup failed', { cause: errors[0] })
  }
}
