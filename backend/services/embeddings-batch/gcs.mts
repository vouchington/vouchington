import { createReadStream } from 'node:fs'
import { Readable } from 'node:stream'
import { requireVertexEnvironment } from '@services/embeddings/vertex'
import { googleRequest } from './google-http.mts'

export function getBatchBucket(): string {
  return requireVertexEnvironment('VERTEX_BATCH_BUCKET')
}

export function gcsUri(key: string): string {
  return `gs://${getBatchBucket()}/${key}`
}

/* no-mistakes: integration=gcs */
export async function uploadGcsFile(
  filePath: string,
  key: string,
  endpoint = 'https://storage.googleapis.com',
): Promise<void> {
  const body = createReadStream(filePath)
  try {
    const response = await googleRequest(uploadUrl(key, endpoint), {
      method: 'POST',
      headers: { 'content-type': 'application/jsonl' },
      body: Readable.toWeb(body) as unknown as RequestInit['body'],
      duplex: 'half',
    })
    await response.body?.cancel()
  } finally {
    body.destroy()
  }
}

/* no-mistakes: integration=gcs */
export async function uploadGcsImage(
  bytes: Buffer,
  key: string,
  mimeType: string,
  endpoint = 'https://storage.googleapis.com',
): Promise<void> {
  const response = await googleRequest(uploadUrl(key, endpoint), {
    method: 'POST',
    headers: { 'content-type': mimeType },
    body: bytes as unknown as RequestInit['body'],
  })
  await response.body?.cancel()
}

function uploadUrl(key: string, endpoint: string): string {
  const query = new URLSearchParams({ uploadType: 'media', name: key, ifGenerationMatch: '0' })
  return `${endpoint}/upload/storage/v1/b/${encodeURIComponent(getBatchBucket())}/o?${query.toString()}`
}

/* no-mistakes: integration=gcs */
export async function listGcsOutputs(
  prefix: string,
  pageToken?: string,
  endpoint = 'https://storage.googleapis.com',
): Promise<{ names: string[]; nextPageToken?: string }> {
  const query = new URLSearchParams({
    prefix,
    maxResults: '1000',
    ...(pageToken ? { pageToken } : {}),
  })
  const response = await googleRequest(
    `${endpoint}/storage/v1/b/${encodeURIComponent(getBatchBucket())}/o?${query.toString()}`,
  )
  const value = (await response.json()) as {
    items?: Array<{ name?: string }>
    nextPageToken?: string
  }
  return {
    names: (value.items ?? []).flatMap(item =>
      typeof item.name === 'string' && item.name.endsWith('.jsonl') ? [item.name] : [],
    ),
    nextPageToken: value.nextPageToken,
  }
}

/* no-mistakes: integration=gcs */
export async function downloadGcsObject(
  key: string,
  endpoint = 'https://storage.googleapis.com',
): Promise<Response> {
  return googleRequest(
    `${endpoint}/storage/v1/b/${encodeURIComponent(getBatchBucket())}/o/${encodeURIComponent(key)}?alt=media`,
    { signal: AbortSignal.timeout(30 * 60_000) },
  )
}

export function parseGcsPrefix(uri: string): string {
  const expected = `gs://${getBatchBucket()}/`
  if (!uri.startsWith(expected))
    throw new Error('Vertex output is outside the configured batch bucket')
  return uri.slice(expected.length)
}
