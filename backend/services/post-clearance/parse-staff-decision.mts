import assert from 'http-assert'
import type { ClearanceStatus } from './types.mts'

export type StaffClearanceDecision = {
  status: ClearanceStatus
  reason_code: string
  private_note?: string
}
export function parseStaffClearanceDecision(value: unknown): StaffClearanceDecision {
  assert(
    value && typeof value === 'object' && !Array.isArray(value),
    422,
    'Invalid clearance decision',
  )
  const body = value as Record<string, unknown>
  assert(
    ['approved', 'rejected', 'in_review', 'pending'].includes(String(body['status'])),
    422,
    'Invalid status',
  )
  assert(
    typeof body['reason_code'] === 'string' && /^[a-z][a-z0-9_]{0,99}$/.test(body['reason_code']),
    422,
    'reason_code must be a stable identifier',
  )
  assert(
    body['private_note'] === undefined ||
      (typeof body['private_note'] === 'string' &&
        body['private_note'].trim() === body['private_note'] &&
        body['private_note'].length <= 4000),
    422,
    'private_note must be trimmed and at most 4000 characters',
  )
  return {
    status: body['status'] as ClearanceStatus,
    reason_code: body['reason_code'],
    private_note: body['private_note'] as string | undefined,
  }
}
