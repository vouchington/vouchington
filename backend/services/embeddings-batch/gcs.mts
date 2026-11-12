import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { Readable } from 'node:stream'
import { requireVertexEnvironment } from '@services/embeddings/vertex'
import { googleRequest } from './google-http.mts'
import { gcsUploadTimeoutMs } from './gcs-upload-timeout.mts'

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
  const fileSize = (await stat(filePath)).size
  const body = createReadStream(filePath)
  try {
    const response = await googleRequest(uploadUrl(key, endpoint), {
      method: 'POST',
      headers: { 'content-type': 'application/jsonl' },
      body: Readable.toWeb(body) as unknown as RequestInit['body'],
      duplex: 'half',
      signal: AbortSignal.timeout(gcsUploadTimeoutMs(fileSize)),
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
    signal: AbortSignal.timeout(gcsUploadTimeoutMs(bytes.byteLength)),
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
): Promise<{ objects: unknown[]; nextPageToken?: string }> {
  const query = new URLSearchParams({
    prefix,
    maxResults: '1000',
    fields: 'items(name,generation,size),nextPageToken',
    ...(pageToken ? { pageToken } : {}),
  })
  const response = await googleRequest(
    `${endpoint}/storage/v1/b/${encodeURIComponent(getBatchBucket())}/o?${query.toString()}`,
  )
  const value = (await readListingJson(response)) as { items?: unknown; nextPageToken?: unknown }
  if (
    !value ||
    typeof value !== 'object' ||
    (value.items !== undefined && !Array.isArray(value.items))
  )
    throw new Error('Malformed GCS output listing')
  if (value.nextPageToken !== undefined && typeof value.nextPageToken !== 'string')
    throw new Error('Malformed GCS output page token')
  return { objects: value.items ?? [], nextPageToken: value.nextPageToken || undefined }
}

/* no-mistakes: integration=gcs */
export async function downloadGcsObject(
  key: string,
  endpoint = 'https://storage.googleapis.com',
  generation?: string,
): Promise<Response> {
  const query = new URLSearchParams({
    alt: 'media',
    ...(generation === undefined ? {} : { generation }),
  })
  return googleRequest(
    `${endpoint}/storage/v1/b/${encodeURIComponent(getBatchBucket())}/o/${encodeURIComponent(key)}?${query.toString()}`,
    { signal: AbortSignal.timeout(30 * 60_000) },
  )
}

export function parseGcsPrefix(uri: string): string {
  const expected = `gs://${getBatchBucket()}/`
  if (!uri.startsWith(expected))
    throw new Error('Vertex output is outside the configured batch bucket')
  return uri.slice(expected.length)
}

async function readListingJson(response: Response): Promise<unknown> {
  if (!response.body) throw new Error('GCS listing has no body')
  const source = Readable.fromWeb(response.body as Parameters<typeof Readable.fromWeb>[0])
  const chunks: Buffer[] = []
  let bytes = 0
  try {
    for await (const chunk of source as AsyncIterable<Uint8Array>) {
      const data = Buffer.from(chunk)
      bytes += data.byteLength
      if (bytes > 4 * 1024 * 1024) throw new Error('GCS output listing exceeded its byte bound')
      chunks.push(data)
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } finally {
    source.destroy()
  }
}
