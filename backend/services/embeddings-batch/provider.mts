import { requireVertexEnvironment } from '@services/embeddings/vertex'
import { GEMINI_EMBEDDING_2_MODEL_ID } from '@services/embeddings/config'
import { googleRequest } from './google-http.mts'

export type VertexBatch = {
  name: string
  state: string
  outputInfo?: { gcsOutputDirectory?: string }
}

function jobUrl(name: string): string {
  const project = requireVertexEnvironment('VERTEX_PROJECT_ID')
  const projectNumber = requireVertexEnvironment('VERTEX_PROJECT_NUMBER')
  const match = /^projects\/([^/]+)\/locations\/us\/batchPredictionJobs\/([a-zA-Z0-9_-]+)$/.exec(
    name,
  )
  if (!match || (match[1] !== project && match[1] !== projectNumber)) {
    throw new Error('Vertex batch name does not belong to the configured project and location')
  }
  return `https://us-aiplatform.googleapis.com/v1/${name}`
}

/* no-mistakes: integration=vertex */
export async function createVertexBatch(
  batchId: string,
  inputUri: string,
  outputUri: string,
): Promise<VertexBatch> {
  const project = requireVertexEnvironment('VERTEX_PROJECT_ID')
  const response = await googleRequest(
    `https://us-aiplatform.googleapis.com/v1/projects/${encodeURIComponent(project)}/locations/us/batchPredictionJobs`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        displayName: `voucha-${batchId}`,
        model: `publishers/google/models/${GEMINI_EMBEDDING_2_MODEL_ID}`,
        inputConfig: { instancesFormat: 'jsonl', gcsSource: { uris: [inputUri] } },
        outputConfig: {
          predictionsFormat: 'jsonl',
          gcsDestination: { outputUriPrefix: outputUri },
        },
      }),
    },
  )
  const batch = (await response.json()) as VertexBatch
  jobUrl(batch.name)
  return batch
}

/* no-mistakes: integration=vertex */
export async function retrieveVertexBatch(name: string): Promise<VertexBatch> {
  const response = await googleRequest(jobUrl(name))
  return response.json() as Promise<VertexBatch>
}

/* no-mistakes: integration=vertex */
export async function stopVertexBatch(name: string): Promise<void> {
  const response = await googleRequest(`${jobUrl(name)}:cancel`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{}',
  })
  await response.body?.cancel()
}

/* no-mistakes: integration=vertex */
export async function findVertexBatch(batchId: string): Promise<VertexBatch | null> {
  const project = requireVertexEnvironment('VERTEX_PROJECT_ID')
  const query = new URLSearchParams({ filter: `display_name="voucha-${batchId}"`, pageSize: '2' })
  const response = await googleRequest(
    `https://us-aiplatform.googleapis.com/v1/projects/${encodeURIComponent(project)}/locations/us/batchPredictionJobs?${query.toString()}`,
  )
  const data = (await response.json()) as {
    batchPredictionJobs?: VertexBatch[]
    nextPageToken?: string
  }
  const batches = data.batchPredictionJobs ?? []
  if (batches.length > 1 || data.nextPageToken)
    throw new Error('Multiple Vertex jobs match one batch submission')
  const batch = batches[0]
  if (!batch) return null
  jobUrl(batch.name)
  return batch
}
