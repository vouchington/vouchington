import type { EmbeddingScanCursor } from '../types.mts'

export function parseEmbeddingScanCursor(data: unknown): EmbeddingScanCursor | undefined {
  if (data == null) return undefined
  if (typeof data !== 'object' || Array.isArray(data))
    throw new Error('Invalid embedding creation payload')
  const record = data as Record<string, unknown>
  if (Object.keys(record).some(key => key !== 'cursor'))
    throw new Error('Unexpected embedding creation payload field')
  if (record.cursor === undefined) return undefined
  if (!record.cursor || typeof record.cursor !== 'object' || Array.isArray(record.cursor))
    throw new Error('Invalid embedding scan cursor')
  const cursor = record.cursor as Record<string, unknown>
  if (
    Object.keys(cursor).some(key => !['sweepStartedAt', 'afterId', 'afterOrderIndex'].includes(key))
  )
    throw new Error('Unexpected embedding scan cursor field')
  if (
    typeof cursor.sweepStartedAt !== 'string' ||
    !Number.isFinite(Date.parse(cursor.sweepStartedAt))
  )
    throw new Error('Invalid embedding sweep timestamp')
  if (cursor.afterId !== undefined && typeof cursor.afterId !== 'string')
    throw new Error('Invalid embedding cursor ID')
  if (
    cursor.afterOrderIndex !== undefined &&
    (!Number.isSafeInteger(cursor.afterOrderIndex) ||
      Number(cursor.afterOrderIndex) < 0 ||
      !cursor.afterId)
  )
    throw new Error('Invalid embedding chunk cursor')
  return cursor as EmbeddingScanCursor
}
