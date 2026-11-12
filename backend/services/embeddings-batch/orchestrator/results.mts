import { Readable } from 'node:stream'
import { downloadGcsObject } from '../gcs.mts'
import type { VertexBatchResultLine } from '../result-parser.mts'
import { boundedLines } from '../bounded-lines.mts'
import { MAX_RESULT_LINE_BYTES, resultByteLimit } from './result-limits.mts'
import type { BatchResultSource } from './result-source.mts'

/** Replay the same pinned generations without staging provider output on local disk. */
export async function* streamBatchResults(
  source: BatchResultSource,
): AsyncGenerator<VertexBatchResultLine> {
  const budget = { bytes: 0, maxBytes: resultByteLimit(source.records) }
  let rows = 0
  for (const object of source.objects) {
    // oxlint-disable-next-line no-await-in-loop -- consume one pinned shard at a time to bound memory.
    const response = await downloadGcsObject(object.name, source.endpoint, object.generation)
    if (!response.body) throw new Error('Vertex result object has no body')
    const stream = Readable.fromWeb(response.body as Parameters<typeof Readable.fromWeb>[0])
    try {
      // oxlint-disable-next-line no-await-in-loop -- each shard is streamed sequentially to bound memory.
      for await (const line of boundedLines(
        withByteBudget(stream, budget),
        MAX_RESULT_LINE_BYTES,
        budget.maxBytes,
      )) {
        if (!line.trim()) continue
        if (++rows > source.records)
          throw new Error('Vertex output exceeded its admitted record count')
        yield JSON.parse(line) as VertexBatchResultLine
      }
    } finally {
      stream.destroy()
    }
  }
}

async function* withByteBudget(
  source: AsyncIterable<Uint8Array>,
  budget: { bytes: number; maxBytes: number },
) {
  for await (const bytes of source) {
    budget.bytes += bytes.byteLength
    if (budget.bytes > budget.maxBytes)
      throw new Error('Vertex results exceeded the admitted byte bound')
    yield bytes
  }
}
