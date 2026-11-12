import { Readable } from 'node:stream'
import { read } from '@data-stores/psql'
import type { BatchJobType } from '@services/embeddings/batch/types'
import { MAX_BATCH_RECORDS } from '@services/embeddings/batch/input-size-limits'
import { downloadGcsObject, parseGcsPrefix } from './gcs.mts'
import { boundedLines } from './bounded-lines.mts'
import { streamBatchResults } from './orchestrator/results.mts'
import { parseBatchResult, isVertexBatchFailure } from './result-parser.mts'

const KEY_TYPES: Record<BatchJobType, string> = {
  topics: 'topic',
  posts: 'post',
  rss_feed_items: 'rss_feed_item',
  crawl_chunks: 'crawl_chunk',
  images: 'image',
}

/** The uploaded manifest survives entity deletion and preserves full-content hashes after clipping. */
export async function loadBatchManifest(batchId: string): Promise<Map<string, Buffer>> {
  const { rows } = await read<{
    records: number
    job_type: BatchJobType
    data: { manifestGcsUri?: string }
  }>(
    '/* loadBatchManifest */ SELECT records, job_type, data FROM gemini_embedding_batches WHERE id = $1',
    [batchId],
  )
  const batch = rows[0]
  if (!batch?.data.manifestGcsUri || batch.records < 1 || batch.records > MAX_BATCH_RECORDS)
    throw new Error('Vertex batch has no valid submitted manifest')
  const response = await downloadGcsObject(parseGcsPrefix(batch.data.manifestGcsUri))
  if (!response.body) throw new Error('Vertex batch manifest has no body')
  const source = Readable.fromWeb(response.body as Parameters<typeof Readable.fromWeb>[0])
  const manifest = new Map<string, Buffer>()
  try {
    for await (const line of boundedLines(source, 256, MAX_BATCH_RECORDS * 256)) {
      if (!line) continue
      const fields = /^([^,"\r\n]+),([a-f0-9]{64})$/.exec(line)
      if (!fields) throw new Error('Malformed Vertex batch manifest row')
      const key = `${KEY_TYPES[batch.job_type]}:${fields[1]}`
      if (manifest.has(key) || manifest.size >= batch.records)
        throw new Error('Duplicate or excess submitted Vertex key')
      manifest.set(key, Buffer.from(fields[2]!, 'hex'))
    }
  } finally {
    source.destroy()
  }
  if (manifest.size !== batch.records)
    throw new Error('Vertex manifest does not contain every submitted row')
  return manifest
}

/** Validate the complete output before any writes; per-row provider errors remain retryable work. */
export async function validateBatchOutput(
  filePath: string,
  manifest: ReadonlyMap<string, Buffer>,
): Promise<void> {
  const seen = new Set<string>()
  for await (const result of streamBatchResults(filePath)) {
    const key = result?.key ?? (isVertexBatchFailure(result) ? result.instance?.key : undefined)
    if (typeof key !== 'string' || !manifest.has(key) || seen.has(key))
      throw new Error('Unexpected or duplicate Vertex result key')
    seen.add(key)
    if (!isVertexBatchFailure(result) && !parseBatchResult(result))
      throw new Error('Malformed successful Vertex batch result')
  }
  if (seen.size !== manifest.size) throw new Error('Vertex batch output is missing submitted rows')
}
