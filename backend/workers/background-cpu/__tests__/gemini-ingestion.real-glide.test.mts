import { randomUUID } from 'node:crypto'
import { Queue, Worker, type Job } from 'glide-mq'
import { describe, expect, it } from 'vitest'
import { workerQueueConnection, workerQueuePrefix } from '@data-stores/valkey-core/glide-mq-client'
import { createTestTopic } from '@voucha/test-helpers'
import { createVertexHttpFixture } from '@voucha/test-helpers/vertex-http'
import { insertBatchTopicMembership } from '@voucha/test-helpers/gemini-batch-ingestion'
import {
  cleanupTestEmbeddingsBatches,
  getTestBatchEntities,
  getTestBatchSummary,
  insertTestEmbeddingsBatch,
} from '@voucha/test-helpers/entities/gemini-embeddings-batches'
import { waitForRealGlideEvent } from '@voucha/test-helpers/real-glide-terminal-deadline'
import { BACKGROUND_CPU_HANDLERS } from '../processors/handlers.mts'

const connection = { connection: workerQueueConnection, prefix: workerQueuePrefix }

describe('Gemini terminal ingestion queue attempt budget', () => {
  it.each([403, 429, 503])(
    'consumes bounded attempts for result HTTP %s and removes membership on final failure',
    async status => {
      const topic = await createTestTopic({ name: `Queue retry ${randomUUID()}` })
      const id = topic.id
      const jobName = `projects/123456/locations/us/batchPredictionJobs/${id}`
      await insertTestEmbeddingsBatch({
        id,
        jobName,
        records: 1,
        batchData: {
          manifestGcsUri: `gs://synthetic-embeddings/${id}/manifest.csv`,
          outputGcsUri: `gs://synthetic-embeddings/${id}/output/`,
        },
      })
      await insertBatchTopicMembership(id, topic.id)
      const handler = BACKGROUND_CPU_HANDLERS.find(
        entry => entry.job.name === 'gemini-embeddings.poll_batch',
      )!
      const attempts = handler.job.options.attempts!
      const fixture = createVertexHttpFixture()
      fixture.agent
        .get('https://us-aiplatform.googleapis.com')
        .intercept({ method: 'GET', path: `/v1/${jobName}` })
        .reply(200, { name: jobName, state: 'JOB_STATE_SUCCEEDED' })
        .times(attempts)
      const storage = fixture.agent.get('https://storage.googleapis.com')
      storage
        .intercept({ method: 'GET', path: /manifest.csv.*alt=media/ })
        .reply(status, {})
        .times(attempts)
      storage
        .intercept({ method: 'GET', path: /\/o\?/ })
        .reply(200, {
          items: [{ name: `${id}/output/predictions.jsonl`, generation: '1', size: '1' }],
        })
        .times(attempts)
      const name = `gemini_ingestion_${randomUUID()}`
      const queue = new Queue(name, connection)
      let worker: Worker | undefined
      try {
        await fixture.run(async () => {
          const terminal = Promise.withResolvers<string>()
          worker = new Worker(name, async (job: Job<unknown>) => handler.handle(job), {
            ...connection,
            blockTimeout: 100,
            promotionInterval: 5,
          })
          worker.on('error', terminal.reject)
          worker.on('failed', (job: Job<unknown> | undefined) => {
            if (job)
              void job
                .getState()
                .then(state => {
                  if (state === 'failed') terminal.resolve(job.id)
                })
                .catch(terminal.reject)
          })
          await worker.waitUntilReady()
          const job = await queue.add(
            handler.job.name,
            { batch_id: id },
            {
              ...handler.job.options,
              // Preserve the production attempt count; only accelerate its backoff for this owned queue.
              backoff: { type: 'fixed', delay: 1 },
            },
          )
          if (!job) throw new Error('Expected admitted ingestion job')
          expect(
            await waitForRealGlideEvent(terminal.promise, 'Gemini final ingestion attempt'),
          ).toBe(job.id)
          const stored = await queue.getJob(job.id)
          expect(await stored?.getState()).toBe('failed')
          expect(stored?.attemptsMade).toBe(attempts)
          expect(await getTestBatchSummary(id)).toMatchObject({ status: 'failed' })
          expect(await getTestBatchEntities(id)).toEqual([])
        })
      } finally {
        await worker?.close()
        await queue.obliterate({ force: true })
        await queue.close()
        await cleanupTestEmbeddingsBatches([id])
      }
    },
  )
})
