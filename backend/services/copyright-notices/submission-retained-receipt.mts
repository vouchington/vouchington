import assert from 'http-assert'
import type { CopyrightNoticeSubmissionRecord } from './types.mts'

export type CopyrightSubmissionReceipt = Pick<CopyrightNoticeSubmissionRecord, 'id' | 'received_at'>

export function decodeSubmissionReceiptSnapshot(value: unknown): CopyrightSubmissionReceipt {
  assert(
    value && typeof value === 'object' && !Array.isArray(value),
    500,
    'Invalid retained copyright submission receipt',
  )
  const snapshot = value as Record<string, unknown>
  assert(
    typeof snapshot.id === 'string' && typeof snapshot.received_at === 'string',
    500,
    'Invalid retained copyright submission receipt',
  )
  const receivedAt = new Date(snapshot.received_at)
  assert(
    Number.isFinite(receivedAt.getTime()),
    500,
    'Invalid retained copyright submission receipt',
  )
  return { id: snapshot.id, received_at: receivedAt }
}
