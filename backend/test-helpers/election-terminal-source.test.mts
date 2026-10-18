import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { TestQueue, TestWorker } from 'glide-mq/testing'
import { createTestQueueTerminalSource } from './election-terminal-source.mts'
import { observeElectionTerminalSource } from './election-vote-stats-events.mts'

/** This is the public testing transport, not evidence of physical Valkey events. */
describe('public TestQueue exact terminal source', () => {
  it('retains actual completion by ID after public removal and ignores another queue', async () => {
    const queue = new TestQueue(`terminal-${randomUUID()}`)
    let other: TestQueue | undefined
    let observer: ReturnType<typeof observeElectionTerminalSource> | undefined
    let worker: TestWorker | undefined
    let foreign: TestWorker | undefined
    let primary: unknown
    let failed = false
    let errors: unknown[] = []
    try {
      other = new TestQueue(`other-${randomUUID()}`)
      const source = createTestQueueTerminalSource(queue, undefined)
      observer = observeElectionTerminalSource(source)
      expect(source.queueName).toBe(queue.name)
      expect(source.queuePrefix).toBeUndefined()
      await observer.ready()
      worker = new TestWorker(queue, async () => 'owned')
      foreign = new TestWorker(other, async () => 'foreign')
      const foreignJob = await other.add('foreign', {}, { jobId: 'foreign-terminal' })
      const job = await queue.add('owned', {})
      if (!job || !foreignJob) throw new Error('Expected actual public jobs')
      const unrelated = observer.wait(foreignJob.id).catch(err => err)
      const result = await observer.wait(job.id)
      expect(result).toEqual({ id: job.id, failed: false })
      await job.remove()
      await expect(observer.wait(job.id)).resolves.toEqual(result)
      await observer.close()
      expect(await unrelated).toMatchObject({ message: 'Owned election observer is closed' })
    } catch (err) {
      primary = err
      failed = true
    } finally {
      const workers = await Promise.allSettled([worker?.close(), foreign?.close()])
      const resources = await Promise.allSettled([observer?.close(), queue.close(), other?.close()])
      const results = [...workers, ...resources]
      errors = results.flatMap(result => (result.status === 'rejected' ? [result.reason] : []))
    }
    if (failed) errors.unshift(primary)
    if (errors.length === 1) throw errors[0]
    if (errors.length)
      throw new AggregateError(errors, 'Owned testing transport cleanup failed', {
        cause: errors[0],
      })
  })
  it('retains terminal failure after retries rather than treating retrying as completion', async () => {
    const queue = new TestQueue(`failure-${randomUUID()}`)
    let observer: ReturnType<typeof observeElectionTerminalSource> | undefined
    const processorError = new Error('Actual public processor failure')
    let attempts = 0
    let worker: TestWorker | undefined
    let primary: unknown
    let failed = false
    let errors: unknown[] = []
    try {
      observer = observeElectionTerminalSource(createTestQueueTerminalSource(queue, undefined))
      await observer.ready()
      worker = new TestWorker(queue, () => {
        attempts++
        throw processorError
      })
      const job = await queue.add('failed', {}, { attempts: 2 })
      if (!job) throw new Error('Expected actual public job')
      await expect(observer.wait(job.id)).resolves.toEqual({
        id: job.id,
        failed: true,
        failedReason: 'Actual public processor failure',
        failureCause: processorError,
      })
      expect((await observer.wait(job.id)).failureCause).toBe(processorError)
      expect(attempts).toBe(2)
    } catch (err) {
      primary = err
      failed = true
    } finally {
      const workers = await Promise.allSettled([worker?.close()])
      const resources = await Promise.allSettled([observer?.close(), queue.close()])
      const results = [...workers, ...resources]
      errors = results.flatMap(result => (result.status === 'rejected' ? [result.reason] : []))
    }
    if (failed) errors.unshift(primary)
    if (errors.length === 1) throw errors[0]
    if (errors.length)
      throw new AggregateError(errors, 'Owned testing transport cleanup failed', {
        cause: errors[0],
      })
  })
  it('rejects pending waits on close and removes only its own queue listeners', async () => {
    const queue = new TestQueue(`close-${randomUUID()}`)
    let observer: ReturnType<typeof observeElectionTerminalSource> | undefined
    let primary: unknown
    let failed = false
    let errors: unknown[] = []
    try {
      const source = createTestQueueTerminalSource(queue, undefined)
      observer = observeElectionTerminalSource(source)
      const baseline = queue.listenerCount('completed') - 1
      const waiting = observer.wait('never-admitted').catch(err => err)
      await observer.close()
      expect(await waiting).toMatchObject({ message: 'Owned election observer is closed' })
      expect(queue.listenerCount('completed')).toBe(baseline)
      await expect(observer.ready()).rejects.toThrow('closed')
    } catch (err) {
      primary = err
      failed = true
    } finally {
      const results = await Promise.allSettled([observer?.close(), queue.close()])
      errors = results.flatMap(result => (result.status === 'rejected' ? [result.reason] : []))
    }
    if (failed) errors.unshift(primary)
    if (errors.length === 1) throw errors[0]
    if (errors.length)
      throw new AggregateError(errors, 'Owned testing transport cleanup failed', {
        cause: errors[0],
      })
  })
})
