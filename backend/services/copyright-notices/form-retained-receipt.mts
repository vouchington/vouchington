import assert from 'http-assert'

export type CopyrightFormIntakeRecord = {
  id: string
  copyright_notice_id: string
  copyright_notice_submission_id: string
}

export function decodeFormReceiptSnapshot(value: unknown): CopyrightFormIntakeRecord {
  assert(
    value && typeof value === 'object' && !Array.isArray(value),
    500,
    'Invalid retained copyright form receipt',
  )
  const snapshot = value as Record<string, unknown>
  assert(
    typeof snapshot.id === 'string' &&
      typeof snapshot.copyright_notice_id === 'string' &&
      typeof snapshot.copyright_notice_submission_id === 'string',
    500,
    'Invalid retained copyright form receipt',
  )
  return {
    id: snapshot.id,
    copyright_notice_id: snapshot.copyright_notice_id,
    copyright_notice_submission_id: snapshot.copyright_notice_submission_id,
  }
}
