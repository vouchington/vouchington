import { describe, expect, it, onTestFinished } from 'vitest'
import { mintUUIDv7 } from '../../../modules/utils/ids.mts'
import { createVertexHttpFixture } from '@voucha/test-helpers/vertex-http'
import {
  createWorkerResultEntity,
  insertWorkerResultMembership,
  readWorkerResultEntity,
} from '@voucha/test-helpers/gemini-worker-results'
import {
  cleanupTestEmbeddingsBatches,
  getTestBatchEntities,
  getTestBatchTerminalTimestamps,
  insertTestEmbeddingsBatch,
} from '@voucha/test-helpers/entities/gemini-embeddings-batches'
import { resultByteLimit } from '@services/embeddings-batch/orchestrator/result-limits'
import { processBatchPolling } from '../processors.mts'

type Fault = {
  name: string
  error: string
  listing?: (prefix: string) => unknown
  manifest?: 'duplicate' | 'missing' | 'absent'
  records?: number
  directory?: string
  repeatPages?: boolean
  oversizedBody?: boolean
}
const faults: Fault[] = [
  {
    name: 'cross-job provider output directory',
    directory: 'other-job/',
    error: 'outside its job prefix',
  },
  {
    name: 'non-array listing',
    listing: () => ({ items: {} }),
    error: 'Malformed GCS output listing',
  },
  {
    name: 'non-string page token',
    listing: () => ({ items: [], nextPageToken: 1 }),
    error: 'Malformed GCS output page token',
  },
  {
    name: 'missing object name',
    listing: () => ({ items: [{}] }),
    error: 'Malformed GCS output object name',
  },
  {
    name: 'excess output objects',
    listing: prefix => ({
      items: Array.from({ length: 18 }, (_, i) => ({
        name: `${prefix}${i}.jsonl`,
        generation: '1',
        size: '1',
      })),
    }),
    error: 'object limit exceeded',
  },
  {
    name: 'excess combined metadata bytes',
    listing: prefix => ({
      items: ['a', 'b'].map(name => ({
        name: `${prefix}${name}.jsonl`,
        generation: '1',
        size: '200000',
      })),
    }),
    error: 'metadata exceeded the admitted byte bound',
  },
  {
    name: 'cycling pagination',
    listing: () => ({ items: [], nextPageToken: 'repeat' }),
    repeatPages: true,
    error: 'listing exceeded its page bound',
  },
  {
    name: 'duplicate manifest key',
    records: 2,
    manifest: 'duplicate',
    error: 'Duplicate or excess submitted Vertex key',
  },
  {
    name: 'incomplete manifest',
    records: 2,
    manifest: 'missing',
    error: 'does not contain every submitted row',
  },
  { name: 'missing manifest URI', manifest: 'absent', error: 'no valid submitted manifest' },
  { name: 'invalid persisted admission count', records: 0, error: 'no valid submitted manifest' },
  {
    name: 'body exceeds advertised metadata',
    oversizedBody: true,
    error: 'results exceeded the admitted byte bound',
  },
]

describe('untrusted Vertex result storage preserves retryable work', () => {
  it.each(faults)(
    'rejects $name before changing the entity or releasing membership',
    async fault => {
      const entity = await createWorkerResultEntity('topics')
      const before = await readWorkerResultEntity(entity)
      const id = mintUUIDv7()
      onTestFinished(() => cleanupTestEmbeddingsBatches([id]))
      const jobName = `projects/123456/locations/us/batchPredictionJobs/${id}`
      const prefix = `${id}/output/`
      await insertTestEmbeddingsBatch({
        id,
        jobName,
        records: fault.records ?? 1,
        batchData: {
          ...(fault.manifest === 'absent'
            ? {}
            : { manifestGcsUri: `gs://synthetic-embeddings/${id}/manifest.csv` }),
          outputGcsUri: `gs://synthetic-embeddings/${prefix}`,
        },
      })
      await insertWorkerResultMembership(id, entity)
      const fixture = createVertexHttpFixture()
      fixture.agent
        .get('https://us-aiplatform.googleapis.com')
        .intercept({ method: 'GET', path: `/v1/${jobName}` })
        .reply(200, {
          name: jobName,
          state: 'JOB_STATE_SUCCEEDED',
          ...(fault.directory
            ? { outputInfo: { gcsOutputDirectory: `gs://synthetic-embeddings/${fault.directory}` } }
            : {}),
        })
      const row = `${entity.id},${before.hash.toString('hex')}\n`
      if (fault.manifest !== 'absent' && fault.records !== 0)
        fixture.agent
          .get('https://storage.googleapis.com')
          .intercept({ method: 'GET', path: /manifest.csv.*alt=media/ })
          .reply(200, fault.manifest === 'duplicate' ? row + row : row)
      let listings = 0
      if (!fault.directory && fault.records !== 0) {
        const response = fixture.agent
          .get('https://storage.googleapis.com')
          .intercept({ method: 'GET', path: /\/o\?/ })
          .reply(200, () => {
            listings++
            return (
              fault.listing?.(prefix) ?? {
                items: [{ name: `${prefix}predictions.jsonl`, generation: '1', size: '1' }],
              }
            )
          })
        if (fault.repeatPages) response.persist()
      }
      if (fault.oversizedBody)
        fixture.agent
          .get('https://storage.googleapis.com')
          .intercept({ method: 'GET', path: /predictions.jsonl.*generation=1/ })
          .reply(200, '\n'.repeat(resultByteLimit(1) + 1))

      await expect(fixture.run(() => processBatchPolling(id))).rejects.toMatchObject({
        cause: { message: expect.stringContaining(fault.error) },
      })
      expect(listings).toBeLessThanOrEqual(4)
      expect(await readWorkerResultEntity(entity)).toEqual(before)
      expect(await getTestBatchEntities(id)).toHaveLength(1)
      expect(await getTestBatchTerminalTimestamps(id)).toEqual({
        completed_at: null,
        failed_at: null,
        cancelled_at: null,
      })
    },
  )
})
