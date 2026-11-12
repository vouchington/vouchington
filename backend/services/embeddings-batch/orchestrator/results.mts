import { createReadStream, createWriteStream } from 'node:fs'
import { rm } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable, Transform } from 'node:stream'
import { finished, pipeline } from 'node:stream/promises'
import { read } from '@data-stores/psql'
import { MAX_BATCH_RECORDS } from '@services/embeddings/batch/input-size-limits'
import { downloadGcsObject, listGcsOutputs, parseGcsPrefix } from '../gcs.mts'
import type { VertexBatchResultLine } from '../result-parser.mts'
import { boundedLines } from '../bounded-lines.mts'

// Clipped text plus one 1536-dimensional vector fits within this defensive wire bound.
const MAX_RESULT_LINE_BYTES = 1024 * 1024
const MAX_RESULT_BYTES = MAX_BATCH_RECORDS * (8192 * 4 + 1536 * 32 + 2048)

export const downloadBatchResults = async (batchId: string): Promise<string> => {
  const { rows } = await read<{
    data: { outputGcsUri?: string; outputInfo?: { gcsOutputDirectory?: string } }
  }>('/* downloadBatchResults */ SELECT data FROM gemini_embedding_batches WHERE id = $1', [
    batchId,
  ])
  const data = rows[0]?.data
  const uri = data?.outputInfo?.gcsOutputDirectory ?? data?.outputGcsUri
  if (!uri) throw new Error('Vertex batch has no output GCS URI')
  const prefix = parseGcsPrefix(uri)
  const filePath = join(tmpdir(), `gemini-batch-results-${batchId}-${randomUUID()}.jsonl`)
  const output = createWriteStream(filePath, { flags: 'wx' })
  let pageToken: string | undefined
  let completed = false
  let objects = 0
  const budget = { bytes: 0 }
  try {
    // A job contains at most MAX_BATCH_RECORDS rows, so even one result object per row is bounded.
    for (let page = 0; page <= Math.ceil(MAX_BATCH_RECORDS / 1000); page++) {
      // oxlint-disable-next-line no-await-in-loop -- each listing depends on the previous page token.
      const listing = await listGcsOutputs(prefix, pageToken)
      for (const name of listing.names) {
        if (++objects > MAX_BATCH_RECORDS) throw new Error('Vertex result object limit exceeded')
        // oxlint-disable-next-line no-await-in-loop -- concurrent appends would interleave JSONL shards.
        await appendResultObject(name, output, budget)
      }
      pageToken = listing.nextPageToken
      if (!pageToken) {
        completed = true
        break
      }
    }
    if (!completed) throw new Error('Vertex result listing exceeded the per-job bound')
    if (objects === 0) throw new Error('Vertex successful batch has no output objects')
    output.end()
    await finished(output)
    return filePath
  } catch (err) {
    output.destroy()
    await cleanupResultsFile(filePath)
    throw err
  }
}

export async function cleanupResultsFile(filePath: string): Promise<void> {
  await rm(filePath, { force: true })
}

async function appendResultObject(
  name: string,
  output: ReturnType<typeof createWriteStream>,
  budget: { bytes: number },
): Promise<void> {
  const response = await downloadGcsObject(name)
  if (!response.body) throw new Error('Vertex result object has no body')
  await pipeline(
    Readable.fromWeb(response.body as Parameters<typeof Readable.fromWeb>[0]),
    new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        budget.bytes += chunk.byteLength
        callback(
          budget.bytes > MAX_RESULT_BYTES
            ? new Error('Vertex results exceeded the per-job byte bound')
            : null,
          chunk,
        )
      },
    }),
    output,
    { end: false },
  )
  // Shards can omit their final LF. Preserve an unambiguous boundary in the combined file.
  await new Promise<void>((resolve, reject) => {
    output.write('\n', err => {
      if (err) reject(err)
      else resolve()
    })
  })
}

export async function* streamBatchResults(
  filePath: string,
): AsyncGenerator<VertexBatchResultLine, void, unknown> {
  const file = createReadStream(filePath)
  let records = 0
  try {
    for await (const line of boundedLines(file, MAX_RESULT_LINE_BYTES, MAX_RESULT_BYTES)) {
      if (!line.trim()) continue
      if (++records > MAX_BATCH_RECORDS) throw new Error('Vertex result record limit exceeded')
      yield JSON.parse(line) as VertexBatchResultLine
    }
  } finally {
    file.destroy()
  }
}
