type SentryEnvelopeDiagnostics = {
  envelopeItemCount?: number
  envelopeItemTypes?: string[]
}

const SENTRY_ENVELOPE_ITEM_TYPE_PATTERN = /^[a-z0-9_.-]{1,64}$/
const MAX_DIAGNOSTIC_ITEM_TYPES = 8

function getUtf8ByteLength(codePoint: number): number {
  if (codePoint <= 0x7f) return 1
  if (codePoint <= 0x7ff) return 2
  if (codePoint <= 0xffff) return 3
  return 4
}

function advanceCursorByUtf8Bytes(envelope: string, cursor: number, length: number): number {
  let bytes = 0
  let nextCursor = cursor
  while (nextCursor < envelope.length && bytes < length) {
    const codePoint = envelope.codePointAt(nextCursor)!
    bytes += getUtf8ByteLength(codePoint)
    nextCursor += codePoint > 0xffff ? 2 : 1
  }
  return nextCursor
}

export function getSentryEnvelopeDiagnostics(envelope: string): SentryEnvelopeDiagnostics {
  const firstLineEnd = envelope.indexOf('\n')
  if (firstLineEnd === -1) {
    return {}
  }

  const itemTypes: string[] = []
  let itemCount = 0
  let cursor = firstLineEnd + 1
  while (cursor < envelope.length) {
    if (envelope[cursor] === '\n') {
      cursor += 1
      continue
    }

    const itemHeaderEnd = envelope.indexOf('\n', cursor)
    if (itemHeaderEnd === -1) {
      break
    }

    const itemHeaderLine = envelope.slice(cursor, itemHeaderEnd).replace(/\r$/, '')
    cursor = itemHeaderEnd + 1
    if (!itemHeaderLine) {
      continue
    }

    let itemHeader: unknown
    try {
      itemHeader = JSON.parse(itemHeaderLine)
    } catch {
      break
    }
    if (typeof itemHeader !== 'object' || itemHeader === null) {
      break
    }

    itemCount += 1
    const itemType = (itemHeader as Record<string, unknown>).type
    if (
      typeof itemType === 'string' &&
      SENTRY_ENVELOPE_ITEM_TYPE_PATTERN.test(itemType) &&
      !itemTypes.includes(itemType) &&
      itemTypes.length < MAX_DIAGNOSTIC_ITEM_TYPES
    ) {
      itemTypes.push(itemType)
    }

    const length = (itemHeader as Record<string, unknown>).length
    if (typeof length === 'number' && Number.isInteger(length) && length >= 0) {
      cursor = advanceCursorByUtf8Bytes(envelope, cursor, length)
      if (envelope[cursor] === '\r' && envelope[cursor + 1] === '\n') {
        cursor += 2
      } else if (envelope[cursor] === '\n') {
        cursor += 1
      }
      continue
    }

    const payloadEnd = envelope.indexOf('\n', cursor)
    if (payloadEnd === -1) {
      break
    }
    cursor = payloadEnd + 1
  }

  return {
    ...(itemCount > 0 ? { envelopeItemCount: itemCount } : {}),
    ...(itemTypes.length > 0 ? { envelopeItemTypes: itemTypes } : {}),
  }
}
