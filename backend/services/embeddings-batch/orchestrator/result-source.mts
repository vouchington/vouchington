import { read } from '@data-stores/psql'
import { listGcsOutputs, parseGcsPrefix } from '../gcs.mts'
import { resultByteLimit } from './result-limits.mts'

export type BatchResultObject = {
  readonly name: string
  readonly generation: string
  readonly size: number
}
export type BatchResultSource = {
  readonly objects: readonly BatchResultObject[]
  readonly records: number
  readonly endpoint: string
}

/** Snapshot immutable object generations once; both validation and apply replay this source. */
export async function getBatchResultSource(
  batchId: string,
  endpoint = 'https://storage.googleapis.com',
): Promise<BatchResultSource> {
  const { rows } = await read<{
    records: number
    data: { outputGcsUri?: string; outputInfo?: { gcsOutputDirectory?: string } }
  }>('/* getBatchResultSource */ SELECT records,data FROM gemini_embedding_batches WHERE id = $1', [
    batchId,
  ])
  const batch = rows[0]
  const original = batch?.data.outputGcsUri
  if (!original) throw new Error('Vertex batch has no output GCS URI')
  const originalPrefix = directoryPrefix(parseGcsPrefix(original))
  const prefix = directoryPrefix(
    parseGcsPrefix(batch.data.outputInfo?.gcsOutputDirectory ?? original),
  )
  if (!prefix.startsWith(originalPrefix))
    throw new Error('Vertex output directory is outside its job prefix')
  const maxBytes = resultByteLimit(batch.records)
  const objects: BatchResultObject[] = []
  const seen = new Set<string>()
  const maxListed = Math.max(1024, batch.records * 2 + 16)
  let listed = 0
  let storedBytes = 0
  let token: string | undefined
  for (let page = 0; page <= Math.ceil(maxListed / 1000); page++) {
    // oxlint-disable-next-line no-await-in-loop -- each bounded page depends on its predecessor token.
    const listing = await listGcsOutputs(prefix, token, endpoint)
    for (const item of listing.objects) {
      if (++listed > maxListed) throw new Error('Vertex result listing exceeded its object bound')
      const object = parseObject(item, prefix, maxBytes)
      if (!object) continue
      if (seen.has(object.name)) throw new Error('Duplicate Vertex result object')
      seen.add(object.name)
      if (object.size === 0) continue
      if (objects.length >= batch.records + 16)
        throw new Error('Vertex result object limit exceeded')
      storedBytes += object.size
      if (storedBytes > maxBytes)
        throw new Error('Vertex result metadata exceeded the admitted byte bound')
      objects.push(Object.freeze(object))
    }
    token = listing.nextPageToken
    if (!token) {
      if (!objects.length) throw new Error('Vertex successful batch has no output objects')
      return Object.freeze({ objects: Object.freeze(objects), records: batch.records, endpoint })
    }
  }
  throw new Error('Vertex result listing exceeded its page bound')
}

function directoryPrefix(prefix: string): string {
  if (!prefix) throw new Error('Vertex output directory is empty')
  return prefix.endsWith('/') ? prefix : `${prefix}/`
}
function parseObject(value: unknown, prefix: string, maxBytes: number): BatchResultObject | null {
  if (!value || typeof value !== 'object' || !('name' in value) || typeof value.name !== 'string')
    throw new Error('Malformed GCS output object name')
  if (!value.name.endsWith('.jsonl')) return null
  if (!value.name.startsWith(prefix) || Buffer.byteLength(value.name) > 1024)
    throw new Error('GCS output object is outside its job prefix')
  if (
    !('generation' in value) ||
    typeof value.generation !== 'string' ||
    !/^[1-9]\d{0,18}$/u.test(value.generation) ||
    BigInt(value.generation) > 9223372036854775807n
  )
    throw new Error('Malformed GCS output generation')
  if (
    !('size' in value) ||
    typeof value.size !== 'string' ||
    !/^(0|[1-9]\d{0,18})$/u.test(value.size) ||
    BigInt(value.size) > BigInt(maxBytes)
  )
    throw new Error('GCS output object exceeds the admitted byte bound')
  return { name: value.name, generation: value.generation, size: Number(value.size) }
}
