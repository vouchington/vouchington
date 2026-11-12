import { fetch } from 'undici'
import { inject, onTestFinished, vi } from 'vitest'
import { createVertexHttpFixture, type VertexHttpFixture } from './vertex-http.mts'
import { createAwsEmulatorLoopbackDispatcher } from './aws-emulator-dispatchers.mts'
import { createGcsTestBucket } from './gcs-emulator.mts'
import { mintUUIDv7 } from '@modules/utils/ids'
import { makeRandomEmbedding } from './index.mts'
import {
  readWorkerResultEntity,
  insertWorkerResultMembership,
  type WorkerResultEntity,
} from './gemini-worker-results.mts'
import {
  cleanupTestEmbeddingsBatches,
  insertTestEmbeddingsBatch,
  getTestBatchSummary,
  getTestBatchEntities,
} from './entities/gemini-embeddings-batches.mts'

/** Invoke the real worker through owned Vertex/GCS fixtures and return observed persistence. */
export async function runWorkerResult(options: {
  entity: WorkerResultEntity
  process: (id: string) => Promise<unknown>
  rowFailure?: boolean
}) {
  const { entity, rowFailure = false } = options
  const before = await readWorkerResultEntity(entity)
  const id = mintUUIDv7()
  onTestFinished(() => cleanupTestEmbeddingsBatches([id]))
  const bucket = `gemini-worker-${id}`
  const jobName = `projects/123456/locations/us/batchPredictionJobs/${id}`
  await insertTestEmbeddingsBatch({
    id,
    jobType: entity.jobType,
    jobName,
    records: 1,
    batchData: {
      manifestGcsUri: `gs://${bucket}/${id}/manifest.csv`,
      outputGcsUri: `gs://${bucket}/${id}/output/`,
    },
  })
  await insertWorkerResultMembership(id, entity)
  const fixture = createVertexHttpFixture({ gcsEmulator: true })
  vi.stubEnv('VERTEX_BATCH_BUCKET', bucket)
  let polls = 0
  const vector = makeRandomEmbedding()
  const output = `${JSON.stringify({ key: entity.key, ...(rowFailure ? { status: { code: 13, message: 'Synthetic provider row failure' } } : { response: { embedding: { values: vector }, tokenCount: '17' } }) })}\n`
  const storage = await prepareWorkerResultGcs({
    fixture,
    bucket,
    batchId: id,
    manifest: `${entity.id},${before.hash.toString('hex')}\n`,
    output,
  })
  fixture.agent
    .get('https://us-aiplatform.googleapis.com')
    .intercept({ method: 'GET', path: `/v1/${jobName}` })
    .reply(200, () => {
      polls++
      return { name: jobName, state: 'JOB_STATE_SUCCEEDED' }
    })
  const firstResult = await fixture.run(() => options.process(id))
  const stored = await readWorkerResultEntity(entity)
  const duplicateResult = await fixture.run(() => options.process(id))
  return {
    before,
    stored,
    vector,
    firstResult,
    duplicateResult,
    afterDuplicate: await readWorkerResultEntity(entity),
    summary: await getTestBatchSummary(id),
    memberships: await getTestBatchEntities(id),
    polls,
    ...storage,
  }
}

/** Store real emulator objects and forward only this bucket's public GCS wire requests. */
async function prepareWorkerResultGcs(options: {
  fixture: VertexHttpFixture
  bucket: string
  batchId: string
  manifest: string
  output: string
}) {
  const { fixture, bucket, batchId, manifest, output } = options
  const { endpoint } = inject('gcsEmulator')
  const dispatcher = createAwsEmulatorLoopbackDispatcher()
  onTestFinished(() => dispatcher.close())
  await createGcsTestBucket(endpoint, bucket)
  const put = async (name: string, body: string) => {
    const query = new URLSearchParams({ uploadType: 'media', name })
    const response = await fetch(
      `${endpoint}/upload/storage/v1/b/${bucket}/o?${query.toString()}`,
      {
        dispatcher,
        method: 'POST',
        headers: { 'content-type': 'application/octet-stream' },
        body,
      },
    )
    const metadata = (await response.json()) as { generation: string }
    if (!response.ok || typeof metadata.generation !== 'string')
      throw new Error('Failed to provision an owned GCS result fixture')
    return metadata.generation
  }
  await put(`${batchId}/manifest.csv`, manifest)
  const generation = await put(`${batchId}/output/predictions.jsonl`, output)
  const reads: Array<string | null> = []
  fixture.agent
    .get('https://storage.googleapis.com')
    .intercept({ method: 'GET', path: new RegExp(`^/storage/v1/b/${bucket}/`) })
    .reply(async request => {
      const target = new URL(request.path, endpoint)
      if (
        target.pathname.endsWith('predictions.jsonl') &&
        target.searchParams.get('alt') === 'media'
      )
        reads.push(target.searchParams.get('generation'))
      const response = await fetch(target, { dispatcher })
      return {
        statusCode: response.status,
        data: Buffer.from(await response.arrayBuffer()),
        responseOptions: { headers: Object.fromEntries(response.headers) },
      }
    })
    .persist()
  return { generation, reads }
}
