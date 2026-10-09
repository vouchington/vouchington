import { throwVoteRouteFailures } from './settle-vote-route-operations.mts'
import { AsyncLocalStorage } from 'node:async_hooks'
import type { Job, Queue, Worker } from 'glide-mq'
import { vi } from 'vitest'

export async function observeOwnedVoteRouteAdmissions(
  owns: (data: unknown) => boolean,
  observeWorkers = true,
) {
  const retry = await import('../data-stores/valkey-glide-mq/glide-mq-retry.mts')
  const { elections } = await import('../queues/elections/queues.mts')
  const { topicRatings } = await import('../queues/topic-ratings/queues.mts')
  const { voteIntegrityQueue } = await import('../queues/vote-integrity/queues.mts')
  const { voteWeightQueue } = await import('../queues/vote-weight/queues.mts')
  type Attempt = {
    promise?: Promise<unknown>
    calls: Array<{ kind: string; data: unknown; result?: Promise<unknown> }>
  }
  const ownedCall = (call: Attempt['calls'][number]) =>
    Array.isArray(call.data) ? call.data.some(job => owns(job.data)) : owns(call.data)
  const context = new AsyncLocalStorage<Attempt>()
  const attempts: Attempt[] = []
  const failures: unknown[] = []
  const requiredKinds = new Set<string>()
  const restores: Array<() => void> = []
  const stopListeners: Array<() => void> = []
  const ends = new Map<string, { failed: boolean; reason?: unknown }>()
  const waiters = new Map<string, (end: { failed: boolean; reason?: unknown }) => void>()
  const reads: Promise<unknown>[] = []
  const observedKinds = new Set<string>()
  const record = (kind: string, job: Job | undefined, failed: boolean, reason?: unknown) => {
    if (!job?.id || !owns(job.data)) return
    const key = `${kind}:${job.id}`
    const end = { failed, reason }
    ends.set(key, end)
    waiters.get(key)?.(end)
    waiters.delete(key)
  }
  const listen = (kind: string, worker: Worker) => {
    observedKinds.add(kind)
    const completed = (job: Job) => record(kind, job, false)
    const failed = (job: Job | undefined, reason: unknown) => {
      if (!job || !owns(job.data)) return
      const reading = job.getState().then(state => {
        if (state === 'failed') record(kind, job, true, reason)
        else if (state === 'completed') record(kind, job, false)
        return state
      })
      void reading.catch(() => undefined)
      reads.push(reading)
    }
    const error = (reason: unknown) => {
      if (
        attempts.some(attempt => attempt.calls.some(call => call.kind === kind && ownedCall(call)))
      )
        failures.push(reason)
    }
    for (const [event, handler] of [
      ['completed', completed],
      ['failed', failed],
      ['error', error],
    ] as const) {
      stopListeners.push(() => worker.off(event, handler))
      worker.on(event, handler)
    }
  }
  const watch = (kind: string, queue: Queue) => {
    const addReal = queue.add
    const add = vi.spyOn(queue, 'add')
    restores.push(() => add.mockRestore())
    add.mockImplementation((...args) => {
      const call: Attempt['calls'][number] = { kind, data: args[1] }
      context.getStore()?.calls.push(call)
      const result = Reflect.apply(addReal, queue, args)
      call.result = result
      void result.catch(() => undefined)
      return result
    })
    const bulkReal = queue.addBulk
    const bulk = vi.spyOn(queue, 'addBulk')
    restores.push(() => bulk.mockRestore())
    bulk.mockImplementation((...args) => {
      const call: Attempt['calls'][number] = { kind, data: args[0] }
      context.getStore()?.calls.push(call)
      const result = Reflect.apply(bulkReal, queue, args)
      call.result = result
      void result.catch(() => undefined)
      return result
    })
  }
  const settle = async () => {
    const admitted = await Promise.allSettled(attempts.map(attempt => attempt.promise!))
    const calls = attempts.flatMap(attempt => attempt.calls.filter(ownedCall))
    for (const kind of requiredKinds)
      if (!calls.some(call => call.kind === kind))
        failures.push(new Error(`No actual owned admission observed for ${kind}`))
    for (let index = 0; index < admitted.length; index++)
      if (admitted[index]!.status === 'rejected' && attempts[index]!.calls.some(ownedCall))
        failures.push((admitted[index] as PromiseRejectedResult).reason)
    const jobs = new Map<string, Job>()
    const returnedCalls = calls.filter(call => call.result !== undefined)
    const actual = await Promise.allSettled(returnedCalls.map(call => call.result!))
    for (let index = 0; index < actual.length; index++) {
      const result = actual[index]!
      if (result.status === 'rejected') continue // Retried attempt; outer promise owns failure.
      const returned = Array.isArray(result.value) ? result.value : [result.value]
      for (const job of returned as Array<Job | null>)
        if (job?.id && owns(job.data)) jobs.set(`${returnedCalls[index]!.kind}:${job.id}`, job)
    }
    const deadline = AbortSignal.timeout(25_000)
    const observed = await Promise.allSettled(
      [...jobs].map(async ([key, job]) => {
        if (!observedKinds.has(key.slice(0, key.indexOf(':')))) return
        const known = ends.get(key)
        if (known?.failed) throw known.reason
        if (known) return
        const state = await job.getState()
        if (state === 'failed') throw new Error(`Owned job failed: ${key}`)
        if (state !== 'active') return // Scheduled/pending jobs remain with canonical teardown.
        const end = await new Promise<{ failed: boolean; reason?: unknown }>((resolve, reject) => {
          const expired = () => {
            waiters.delete(key)
            reject(new Error(`Active job observation expired: ${key}; native work not cancelled`))
          }
          waiters.set(key, value => {
            deadline.removeEventListener('abort', expired)
            resolve(value)
          })
          deadline.addEventListener('abort', expired, { once: true })
          if (deadline.aborted) expired()
          const terminal = ends.get(key)
          if (terminal) waiters.get(key)?.(terminal)
        })
        if (end.failed) throw end.reason
      }),
    )
    for (const result of observed) if (result.status === 'rejected') failures.push(result.reason)
  }
  const restoreAll = (callbacks: Array<() => void>) => {
    for (const restore of callbacks.toReversed()) {
      try {
        restore()
      } catch (err) {
        failures.push(err)
      }
    }
  }
  const finish = async () => {
    try {
      await settle()
    } catch (err) {
      failures.push(err)
    }
    restoreAll(stopListeners)
    for (const result of await Promise.allSettled(reads))
      if (result.status === 'rejected') failures.push(result.reason)
    restoreAll(restores)
    waiters.clear()
    throwVoteRouteFailures(failures)
  }
  try {
    if (observeWorkers) {
      listen('elections', (await import('../workers/elections/workers.mts')).elections)
      listen('topic-ratings', (await import('../workers/topic-ratings/workers.mts')).topicRatings)
    }
    const real = retry.retryTransientEnqueue
    const spy = vi.spyOn(retry, 'retryTransientEnqueue')
    restores.push(() => spy.mockRestore())
    spy.mockImplementation(fn => {
      const attempt: Attempt = { calls: [] }
      attempts.push(attempt)
      const promise = context.run(attempt, () => real(fn))
      attempt.promise = promise
      void promise.catch(() => undefined)
      return promise
    })
    for (const [kind, queue] of [
      ['elections', elections],
      ['topic-ratings', topicRatings],
      ['vote-integrity', voteIntegrityQueue],
      ['vote-weight', voteWeightQueue],
    ] as const)
      watch(kind, queue as Queue)
  } catch (err) {
    failures.push(err)
    await finish()
  }
  return Object.assign(finish, { requireAdmission: (kind: string) => requiredKinds.add(kind) })
}

export function observeOwnedPenaltyAdmissions(ownedUserIds: Set<string>) {
  return observeOwnedVoteRouteAdmissions(
    data =>
      typeof data === 'object' &&
      data !== null &&
      'userId' in data &&
      ownedUserIds.has(String(data.userId)),
    false,
  )
}
