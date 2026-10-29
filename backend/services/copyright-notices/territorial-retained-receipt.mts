import assert from 'http-assert'

export type TerritorialReceiptSnapshot = {
  notice_id: string
  receipt_id: string
  acknowledgment_id: string
  route_destination: 'staff_queue'
}

export function decodeTerritorialReceiptSnapshot(value: unknown): TerritorialReceiptSnapshot {
  assert(
    value && typeof value === 'object' && !Array.isArray(value),
    500,
    'Invalid retained territorial receipt',
  )
  const snapshot = value as Record<string, unknown>
  assert(
    typeof snapshot.notice_id === 'string' &&
      typeof snapshot.receipt_id === 'string' &&
      typeof snapshot.acknowledgment_id === 'string' &&
      snapshot.route_destination === 'staff_queue',
    500,
    'Invalid retained territorial receipt',
  )
  return {
    notice_id: snapshot.notice_id,
    receipt_id: snapshot.receipt_id,
    acknowledgment_id: snapshot.acknowledgment_id,
    route_destination: snapshot.route_destination,
  }
}
