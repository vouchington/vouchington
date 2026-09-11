import { afterAll, describe, expect, it } from 'vitest'
import type { Job } from 'glide-mq'
import { QUEUE_NAME } from '@queues/wikipedia-recommender/config'
import type { DispatchJobData } from '@queues/wikipedia-recommender/types'
import { processWikipediaRecommenderWorkerJob } from './processors/worker-callback.mts'
import {
  createWikipediaRecommenderWorker,
  wikipediaRecommender,
  type WikipediaRecommenderWorkerDeps,
} from './workers.mts'

describe('wikipedia recommender worker routing', () => {
  // `workers.mts` attaches `wikipediaRecommender` as a live worker at module scope on import. No
  // test here needs it — the tests below use an injected `CapturingWorker` or call the processor
  // directly — but leaving it attached would leak into every other file sharing this Vitest fork
  // (`isolate: false`), draining any job later added to this queue before a `waiting` scan could
  // see it. See docs/development/reference-tests-parallel-safety-and-test-root-hygiene.md.
  afterAll(async () => {
    await wikipediaRecommender.close()
  })

  it('constructs the dispatcher worker with the queue callback and runtime options', () => {
    const constructed: unknown[] = []
    class CapturingWorker<T> {
      constructor(name: string, processor: (job: Job<T>) => unknown, options: unknown) {
        constructed.push({ name, processor, options })
      }
    }
    const connection = { url: 'valkey://test' }

    const worker = createWikipediaRecommenderWorker({
      WorkerCtor: CapturingWorker as unknown as WikipediaRecommenderWorkerDeps['WorkerCtor'],
      connection: connection as unknown as WikipediaRecommenderWorkerDeps['connection'],
      prefix: 'test-prefix',
      concurrency: 7,
    })

    expect(worker).toBeInstanceOf(CapturingWorker)
    expect(constructed).toEqual([
      {
        name: QUEUE_NAME,
        processor: processWikipediaRecommenderWorkerJob,
        options: {
          connection,
          prefix: 'test-prefix',
          concurrency: 7,
        },
      },
    ])
  })

  it('routes dispatcher jobs to the dispatch processor', async () => {
    const dispatched: DispatchJobData[] = []
    const processDispatch = (data: DispatchJobData): Promise<void> => {
      dispatched.push(data)
      return Promise.resolve()
    }
    const data = { scheduled_at: '2026-06-05T00:00:00.000Z' }

    await processWikipediaRecommenderWorkerJob(
      {
        data,
        opts: { ordering: { key: 'dispatcher' } },
      } as Job<DispatchJobData>,
      { processDispatch },
    )

    expect(dispatched).toEqual([data])
  })

  it('rejects unknown ordering keys', async () => {
    await expect(
      processWikipediaRecommenderWorkerJob(
        {
          data: { scheduled_at: '2026-06-05T00:00:00.000Z' },
          opts: { ordering: { key: 'unexpected' } },
        } as Job<DispatchJobData>,
        { processDispatch: () => Promise.resolve() },
      ),
    ).rejects.toThrow('Unknown ordering key: unexpected')
  })
})
