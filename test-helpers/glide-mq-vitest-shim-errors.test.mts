import { once } from 'node:events'
import {
  BatchError as NativeBatchError,
  GlideMQError,
  UnrecoverableError as NativeUnrecoverableError,
} from 'glide-mq/testing'
import { afterEach, describe, expect, it } from 'vitest'
import { BatchError, Queue, UnrecoverableError, Worker } from './glide-mq-vitest-shim.mts'

describe('GlideMQ shim error handling', () => {
  const workers: Worker[] = []

  afterEach(async () => {
    await Promise.all(workers.splice(0).map(worker => worker.close()))
  })

  it('emits the canonical unrecoverable error and does not retry it', async () => {
    const queue = new Queue(`shim-unrecoverable-${crypto.randomUUID()}`)
    let attempts = 0
    const worker = new Worker(queue, () => {
      attempts++
      throw new UnrecoverableError('permanent failure')
    })
    workers.push(worker)
    const failed = once(worker, 'failed')

    await expect(queue.add('fail', {}, { attempts: 3 })).rejects.toThrow('permanent failure')
    const [, error] = await failed
    expect(error).toBeInstanceOf(NativeUnrecoverableError)
    expect(error).toBeInstanceOf(GlideMQError)
    expect(attempts).toBe(1)
  })

  it('emits a canonical batch error when a processor rejects', async () => {
    const queue = new Queue(`shim-batch-error-${crypto.randomUUID()}`)
    const worker = new Worker(queue, () => {
      throw new BatchError([new Error('item failure')])
    })
    workers.push(worker)
    const failed = once(worker, 'failed')

    await expect(queue.add('fail', {})).rejects.toThrow(Error)
    const [, error] = await failed
    expect(error).toBeInstanceOf(NativeBatchError)
    expect(error).toBeInstanceOf(GlideMQError)
  })
})
