import { describe, expect, it, onTestFinished } from 'vitest'
import { onEnqueueAdmission, type EnqueueAdmission } from './glide-mq-admission.mts'
import { createEnqueueFunction, createBulkEnqueueFunction } from './glide-mq-enqueue.mts'
import { withEnqueueAdmissionQueue } from '../../test-helpers/enqueue-admission.mts'
import { readEnqueuedJob } from '../../test-helpers/queue-jobs.mts'
import { sentryCaptureExceptionMock } from '../../test-helpers/vitest.setup.sentry-mock.mts'

describe('canonical enqueue admission observation', () => {
  it('publishes the original single admission promise and exact source queue before returning', async () => {
    await withEnqueueAdmissionQueue(async (queue, events) => {
      const data = { id: crypto.randomUUID() }
      const enqueue = createEnqueueFunction<{ id: string }, 'single'>({
        queue,
        queueName: queue.name,
        jobName: 'single',
      })
      const admission = enqueue(data)
      expect(events).toHaveLength(1)
      expect(events[0]!.queue).toBe(queue)
      expect(events[0]!.queueName).toBe(queue.name)
      expect(events[0]!.jobName).toBe('single')
      expect(events[0]!.inputs).toEqual([data])
      expect(events[0]!.completion).toBe(admission)
      const job = await readEnqueuedJob(queue, await admission)
      expect(job.name).toBe('single')
      expect(job.data).toEqual(data)
      expect(events[0]!.observerErrors).toEqual([])
      expect(events[0]!.reportingErrors).toEqual([])
    })
  })

  it('retains the original pre-admission serialization rejection without manufacturing a job', async () => {
    await withEnqueueAdmissionQueue(async (queue, events) => {
      type CyclicPayload = { self?: CyclicPayload }
      const data: CyclicPayload = {}
      data.self = data
      const enqueue = createEnqueueFunction<CyclicPayload, 'invalid'>({
        queue,
        queueName: queue.name,
        jobName: 'invalid',
      })
      const admission = enqueue(data)
      expect(events).toHaveLength(1)
      expect(events[0]!.completion).toBe(admission)
      const [caller, observer] = await Promise.allSettled([admission, events[0]!.completion])
      expect(caller!.status).toBe('rejected')
      expect(observer!.status).toBe('rejected')
      if (caller!.status !== 'rejected' || observer!.status !== 'rejected')
        throw new Error('Expected serialization rejection')
      expect(observer!.reason).toBe(caller!.reason)
      expect(caller!.reason).toBeInstanceOf(Error)
      expect(events[0]!.observerErrors).toEqual([])
    })
  })

  it('preserves compact bulk deduplication and independently readable valid sibling jobs', async () => {
    await withEnqueueAdmissionQueue(async (queue, events) => {
      const duplicate = `existing-${crypto.randomUUID()}`
      await queue.add('bulk', { id: 'already-owned' }, { jobId: duplicate })
      const inputs = [
        { id: crypto.randomUUID(), jobId: duplicate },
        { id: crypto.randomUUID(), jobId: `first-${crypto.randomUUID()}` },
        { id: crypto.randomUUID(), jobId: `second-${crypto.randomUUID()}` },
      ]
      const enqueue = createBulkEnqueueFunction<
        { id: string; jobId: string },
        { id: string },
        'bulk'
      >({
        queue,
        queueName: queue.name,
        jobName: 'bulk',
        buildJob: (input: { id: string; jobId: string }) => ({
          data: { id: input.id },
          opts: { jobId: input.jobId },
        }),
      })
      const admission = enqueue(inputs)
      expect(events).toHaveLength(1)
      expect(events[0]!.completion).toBe(admission)
      expect(events[0]!.inputs).toEqual(inputs.map(input => ({ id: input.id })))
      const jobs = await admission
      expect(jobs).toHaveLength(2)
      for (const input of inputs.slice(1)) {
        const returned = jobs.find(job => job.id === input.jobId)
        expect(returned).toBeDefined()
        const persisted = await readEnqueuedJob(queue, returned)
        expect(persisted.name).toBe('bulk')
        expect(persisted.data).toEqual({ id: input.id })
      }
    })
  })

  it('isolates repeated observer and real Sentry reporting failures from admission and later observers', async () => {
    await withEnqueueAdmissionQueue(async (queue, events, restore) => {
      const observerFailure = new Error('Owned admission observer failed')
      const reporterFailure = new Error('Owned admission reporter failed')
      const previous = sentryCaptureExceptionMock.getMockImplementation()
      restore(() => sentryCaptureExceptionMock.mockImplementation(previous ?? (() => undefined)))
      sentryCaptureExceptionMock.mockImplementation((...args) => {
        if (args[0] === observerFailure) throw reporterFailure
        return previous?.(...args)
      })
      let tail: EnqueueAdmission | undefined
      for (let index = 0; index < 2; index++)
        restore(
          onEnqueueAdmission(event => {
            if (event.queue === queue) throw observerFailure
            return undefined
          }),
        )
      restore(
        onEnqueueAdmission(event => {
          if (event.queue === queue) tail = event
          return undefined
        }),
      )
      const data = { id: crypto.randomUUID() }
      const admission = createEnqueueFunction<{ id: string }, 'faults'>({
        queue,
        queueName: queue.name,
        jobName: 'faults',
      })(data)
      expect(tail).toBe(events[0])
      expect(tail!.completion).toBe(admission)
      const persisted = await readEnqueuedJob(queue, await admission)
      expect(persisted.data).toEqual(data)
      expect(tail!.observerErrors).toHaveLength(2)
      expect(tail!.reportingErrors).toHaveLength(2)
      for (const failure of tail!.observerErrors) expect(failure).toBe(observerFailure)
      for (const failure of tail!.reportingErrors) expect(failure).toBe(reporterFailure)
      expect(
        sentryCaptureExceptionMock.mock.calls.filter(([failure]) => failure === observerFailure),
      ).toHaveLength(2)
    })
  })

  it('detaches idempotently without cancelling an already published admission', async () => {
    await withEnqueueAdmissionQueue(async (queue, events, restore) => {
      const observed: EnqueueAdmission[] = []
      const off = onEnqueueAdmission(event => {
        if (event.queue === queue) observed.push(event)
        return undefined
      })
      restore(off)
      const enqueue = createEnqueueFunction<{ id: string }, 'detach'>({
        queue,
        queueName: queue.name,
        jobName: 'detach',
      })
      const first = enqueue({ id: crypto.randomUUID() })
      off()
      off()
      const second = enqueue({ id: crypto.randomUUID() })
      expect(observed).toHaveLength(1)
      expect(observed[0]!.completion).toBe(first)
      expect(events).toHaveLength(2)
      await expect(readEnqueuedJob(queue, await first)).resolves.toMatchObject({ name: 'detach' })
      await expect(readEnqueuedJob(queue, await second)).resolves.toMatchObject({ name: 'detach' })
    })
  })

  it('reports action and cleanup failures once without rethrowing cleanup from the finish hook', async () => {
    const primary = new Error('Owned admission action failed')
    const secondary = new Error('Owned admission cleanup failed')
    const outcome = await Promise.allSettled([
      withEnqueueAdmissionQueue(async (_queue, _events, restore) => {
        restore(() => {
          throw secondary
        })
        throw primary
      }),
    ])
    expect(outcome[0]!.status).toBe('rejected')
    if (outcome[0]!.status !== 'rejected') throw new Error('Expected combined owner failure')
    const failure = outcome[0]!.reason
    expect(failure).toBeInstanceOf(AggregateError)
    if (!(failure instanceof AggregateError)) throw new Error('Expected aggregate owner failure')
    expect(failure.cause).toBe(primary)
    expect(failure.errors).toHaveLength(2)
    expect(failure.errors[0]).toBe(primary)
    expect(failure.errors[1]).toBe(secondary)
    // The real onTestFinished callback still runs after this assertion and must not report again.
  })

  it('releases a held action from the real finish hook before draining admissions and restoring observers', async () => {
    const entered = Promise.withResolvers<void>()
    const released = Promise.withResolvers<void>()
    const order: string[] = []
    let owner: Promise<void> | undefined
    // Finish hooks run as a stack: verify only after the fixture's later hook has drained it.
    onTestFinished(async () => {
      if (!owner) throw new Error('Admission owner was not started')
      await owner
      expect(order).toEqual(['release', 'action', 'admission', 'restore'])
    })
    owner = withEnqueueAdmissionQueue(async (queue, events, restore, release) => {
      release(() => {
        order.push('release')
        released.resolve()
      })
      restore(() => {
        expect(events).toHaveLength(1)
        order.push('restore')
      })
      entered.resolve()
      await released.promise
      order.push('action')
      const data = { id: crypto.randomUUID() }
      const admission = createEnqueueFunction<{ id: string }, 'released'>({
        queue,
        queueName: queue.name,
        jobName: 'released',
      })(data)
      expect(events[0]!.completion).toBe(admission)
      const persisted = await readEnqueuedJob(queue, await admission)
      expect(persisted.data).toEqual(data)
      order.push('admission')
    })
    await entered.promise
    expect(order).toEqual([])
    // Return with the action intentionally held; the genuine fixture hook must release and join it.
  })
})
