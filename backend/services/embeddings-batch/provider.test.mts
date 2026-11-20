import { describe, expect, it } from 'vitest'
import { createVertexHttpFixture } from '@voucha/test-helpers/vertex-http'
import { createVertexBatch, findVertexBatch, retrieveVertexBatch } from './provider.mts'

describe('Vertex batch HTTP contract', () => {
  it('submits JSONL in us and accepts the project number in the canonical resource name', async () => {
    const fixture = createVertexHttpFixture()
    const name = 'projects/123456/locations/us/batchPredictionJobs/synthetic-job'
    fixture.agent
      .get('https://us-aiplatform.googleapis.com')
      .intercept({
        method: 'POST',
        path: '/v1/projects/synthetic-project/locations/us/batchPredictionJobs',
        body: JSON.stringify({
          displayName: 'voucha-synthetic-id',
          model: 'publishers/google/models/gemini-embedding-2',
          inputConfig: {
            instancesFormat: 'jsonl',
            gcsSource: { uris: ['gs://synthetic/input.jsonl'] },
          },
          outputConfig: {
            predictionsFormat: 'jsonl',
            gcsDestination: { outputUriPrefix: 'gs://synthetic/output/' },
          },
        }),
      })
      .reply(200, { name, state: 'JOB_STATE_PENDING' })
    await fixture.run(async () => {
      expect(
        await createVertexBatch(
          'synthetic-id',
          'gs://synthetic/input.jsonl',
          'gs://synthetic/output/',
        ),
      ).toEqual({ name, state: 'JOB_STATE_PENDING' })
    })
  })
  it('discovers an ambiguous submission by deterministic display name', async () => {
    const fixture = createVertexHttpFixture()
    const name = 'projects/123456/locations/us/batchPredictionJobs/synthetic-job'
    const query = new URLSearchParams({
      filter: 'display_name="voucha-synthetic-id"',
      pageSize: '2',
    })
    fixture.agent
      .get('https://us-aiplatform.googleapis.com')
      .intercept({
        method: 'GET',
        path: `/v1/projects/synthetic-project/locations/us/batchPredictionJobs?${query.toString()}`,
      })
      .reply(200, { batchPredictionJobs: [{ name, state: 'JOB_STATE_RUNNING' }] })
    await fixture.run(async () => {
      expect(await findVertexBatch('synthetic-id')).toEqual({ name, state: 'JOB_STATE_RUNNING' })
    })
  })
  it('rejects another project or multiple job path segments before HTTP', async () => {
    createVertexHttpFixture()
    await expect(
      retrieveVertexBatch('projects/other/locations/us/batchPredictionJobs/job'),
    ).rejects.toThrow('does not belong')
    await expect(
      retrieveVertexBatch('projects/123456/locations/us/batchPredictionJobs/job/extra'),
    ).rejects.toThrow('does not belong')
  })
})
