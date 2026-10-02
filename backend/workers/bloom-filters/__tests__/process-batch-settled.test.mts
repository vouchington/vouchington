import { BatchError, Queue, Worker, type Job } from 'glide-mq'
import { describe, expect, it, vi } from 'vitest'
import { processBatchSettled } from '../process-batch-settled.mts'

function fakeJob(name: string): Job {
  return { name, data: {} } as Job
}

async function captureBatchError(run: () => Promise<unknown>): Promise<BatchError> {
  const thrown = await run().then(
    () => undefined,
    (err: unknown) => err,
  )
  expect(thrown).toBeInstanceOf(BatchError)
  return thrown as BatchError
}

describe('processBatchSettled', () => {
  it('resolves one result per job, in order, when every job succeeds', async () => {
    const results = await processBatchSettled([fakeJob('a'), fakeJob('b'), fakeJob('c')], job =>
      Promise.resolve(`ran-${job.name}`),
    )

    expect(results).toEqual(['ran-a', 'ran-b', 'ran-c'])
  })

  it('reports each failed job at its own index and still runs the rest of the batch', async () => {
    const failure = new Error('b failed')
    const runOne = vi.fn<(job: Job) => Promise<string>>(job =>
      job.name === 'b' ? Promise.reject(failure) : Promise.resolve(`ran-${job.name}`),
    )

    const error = await captureBatchError(() =>
      processBatchSettled([fakeJob('a'), fakeJob('b'), fakeJob('c')], runOne),
    )

    expect(error.results).toEqual(['ran-a', failure, 'ran-c'])
    expect(runOne).toHaveBeenCalledTimes(3)
  })

  it('wraps a non-Error rejection and a synchronous throw as per-job errors', async () => {
    const error = await captureBatchError(() =>
      processBatchSettled([fakeJob('string'), fakeJob('sync')], job => {
        if (job.name === 'sync') throw new Error('sync failure')
        // oxlint-disable-next-line typescript/prefer-promise-reject-errors -- The worker must wrap arbitrary rejection values.
        return Promise.reject('plain string')
      }),
    )

    expect(error.results).toEqual([new Error('plain string'), new Error('sync failure')])
  })

  it('fails only the job that threw when run as a batch-mode worker', async () => {
    const queueName = `bloom-batch-${crypto.randomUUID()}`
    const queue = new Queue(queueName, {})
    const worker = new Worker(
      queueName,
      (jobs: Job[]) =>
        processBatchSettled(jobs, job =>
          job.name === 'bad' ? Promise.reject(new Error('bad failed')) : Promise.resolve('ok'),
        ),
      { batch: { size: 10 } },
    )

    try {
      await expect(
        queue.add('good', {}, { attempts: 1, removeOnComplete: true }),
      ).resolves.toBeDefined()
      await expect(queue.add('bad', {}, { attempts: 1, removeOnFail: true })).rejects.toThrow(
        'bad failed',
      )
    } finally {
      await worker.close()
      await queue.close()
    }
  })
})
