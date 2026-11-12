import { sha256 } from '@modules/utils'
import { EMBEDDING_DIMENSION } from '@services/embeddings/config'

export type VertexBatchResultLine = {
  key?: string
  request?: { content?: { parts?: Array<{ text?: string; fileData?: { fileUri?: string } }> } }
  response?: { embedding?: { values?: unknown }; tokenCount?: string | number }
  status?: unknown
  error?: unknown
  instance?: { key?: string }
}

type ParsedBatchResult = {
  entityId: string
  entityType: string
  hash: Buffer
  embedding: number[]
  inputTokenCount: number | null
}
const DOCUMENT_PREFIX = 'title: none | text: '

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
  const parts = value.request?.content?.parts
  if (!parts || parts.length !== 1) return null
  const part = parts[0]!
  let hash: Buffer
  if (entityType === 'image') {
    const uri = part.fileData?.fileUri
    const match =
      typeof uri === 'string'
        ? /\/images\/([^/]+)\/([a-f0-9]{64})\.(?:jpeg|png|webp)$/.exec(uri)
        : null
    if (!match || match[1] !== entityId) return null
    hash = Buffer.from(match[2]!, 'hex')
  } else {
    if (typeof part.text !== 'string' || !part.text.startsWith(DOCUMENT_PREFIX)) return null
    hash = sha256(part.text.slice(DOCUMENT_PREFIX.length))
  }
  const count = value.response?.tokenCount === undefined ? null : Number(value.response.tokenCount)
  const inputTokenCount = count !== null && Number.isSafeInteger(count) && count >= 0 ? count : null
  return { entityId, entityType, hash, embedding: embedding as number[], inputTokenCount }
}
