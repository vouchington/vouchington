import { asRecord } from '../retrospective-transcript-facts/compute-shared.mts'

export const MAX_PENDING_CLAUDE_TOOL_USES = 10_000
export const MAX_RETAINED_RAW_TEXT_CHARS = 64 * 1024
export const MAX_RETAINED_RECORDS = 10_000
export const MAX_RETAINED_RAW_BYTES = 2 * 1024 * 1024
export const MAX_PENDING_CLAUDE_TOOL_USE_BYTES = 2 * 1024 * 1024
export const MAX_INHERITED_CODEX_SPOOL_BYTES = 512 * 1024 * 1024

export type RawRetention = {
  commandTextsTruncated: number
  errorTextsTruncated: number
  pendingToolUsesDropped: number
  pendingToolUseBytesDropped: number
  recordsDropped: number
  rawBytesDropped: number
  retainedRawBytes: number
}

export function emptyRawRetention(): RawRetention {
  return {
    commandTextsTruncated: 0,
    errorTextsTruncated: 0,
    pendingToolUsesDropped: 0,
    pendingToolUseBytesDropped: 0,
    recordsDropped: 0,
    rawBytesDropped: 0,
    retainedRawBytes: 0,
  }
}

export function truncateRawText(text: string, retention: RawRetention, kind: 'command' | 'error') {
  if (text.length <= MAX_RETAINED_RAW_TEXT_CHARS) return text
  if (kind === 'command') retention.commandTextsTruncated++
  else retention.errorTextsTruncated++
  return `${text.slice(0, MAX_RETAINED_RAW_TEXT_CHARS)}… [truncated]`
}

export function appendBounded<T>(records: T[], record: T, retention: RawRetention): void {
  const bytes = Buffer.byteLength(JSON.stringify(record))
  if (
    records.length >= MAX_RETAINED_RECORDS ||
    retention.retainedRawBytes + bytes > MAX_RETAINED_RAW_BYTES
  ) {
    retention.recordsDropped++
    retention.rawBytesDropped += bytes
    return
  }
  records.push(record)
  retention.retainedRawBytes += bytes
}

export function extractToolResultText(content: unknown): string {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  let text = ''
  for (const [index, block] of content.entries()) {
    const record = asRecord(block)
    const next = record?.type === 'text' && typeof record.text === 'string' ? record.text : ''
    text += `${index > 0 ? '\n' : ''}${next}`
  }
  return text
}
