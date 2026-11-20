import { EMBEDDING_DIMENSION } from '@services/embeddings/config'

export type VertexBatchResultLine = {
  key?: string
  request?: unknown
  response?: { embedding?: { values?: unknown }; tokenCount?: string | number }
  status?: unknown
  error?: unknown
  instance?: { key?: string }
}

type ParsedBatchResult = {
  entityId: string
  entityType: string
  embedding: number[]
  inputTokenCount: number | null
}

export function isVertexBatchFailure(value: VertexBatchResultLine): boolean {
  if (!value || typeof value !== 'object') return false
  const status = value.error ?? value.status
  return typeof status === 'string'
    ? status.trim().length > 0
    : typeof status === 'object' &&
        status !== null &&
        (('code' in status && Number.isInteger(status.code) && Number(status.code) > 0) ||
          ('message' in status && typeof status.message === 'string' && status.message.length > 0))
}

export function parseBatchResult(value: VertexBatchResultLine): ParsedBatchResult | null {
  if (!value || typeof value.key !== 'string' || isVertexBatchFailure(value)) return null
  const split = value.key.indexOf(':')
  if (split < 1) return null
  const entityType = value.key.slice(0, split)
  const entityId = value.key.slice(split + 1)
  if (!['post', 'topic', 'rss_feed_item', 'crawl_chunk', 'image'].includes(entityType) || !entityId)
    return null
  const embedding = value.response?.embedding?.values
  if (
    !Array.isArray(embedding) ||
    embedding.length !== EMBEDDING_DIMENSION ||
    !embedding.every((entry: unknown) => typeof entry === 'number' && Number.isFinite(entry))
  )
    return null
  const rawTokenCount = value.response?.tokenCount
  let inputTokenCount: number | null = null
  if (rawTokenCount !== undefined) {
    if (typeof rawTokenCount !== 'string' && typeof rawTokenCount !== 'number') return null
    if (typeof rawTokenCount === 'string' && !/^\d+$/u.test(rawTokenCount)) return null
    const count = Number(rawTokenCount)
    if (!Number.isSafeInteger(count) || count < 0) return null
    inputTokenCount = count
  }
  return { entityId, entityType, embedding: embedding as number[], inputTokenCount }
}
