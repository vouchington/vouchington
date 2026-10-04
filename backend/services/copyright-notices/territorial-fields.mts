import { createHash } from 'node:crypto'
import assert from 'http-assert'
import { isUUID } from '@modules/utils'

export const TERRITORIAL_COMPLAINT_WINDOW_MONTHS = 6

export type TerritorialCopyrightJurisdiction = 'eu_dsa' | 'uk'
export type CopyrightStaffDisposition = 'maintain' | 'revoke'

export type TerritorialNoticeRequest = {
  contact: string
  contentDescription: string
  grounds: string
  hostedUseUrl: string
}

export type EuTerritorialNoticeRequest = TerritorialNoticeRequest & {
  notifierName: string
  notifierEmail: string
  goodFaithStatement: true
}

export function territorialCopyrightUnavailableMessage(
  jurisdiction: TerritorialCopyrightJurisdiction,
): string {
  return jurisdiction === 'eu_dsa'
    ? 'EU copyright notices are not available'
    : 'UK copyright notices are not available'
}

export function assertIdempotencyKey(value: string): void {
  assert(isUUID(value), 400, 'Idempotency-Key must be a UUID')
}

export function assertBoundedText(value: string, maxLength: number, message: string): string {
  const trimmed = value.trim()
  assert(trimmed.length > 0 && value.length <= maxLength, 422, message)
  return trimmed
}

export function assertPolicyVersion(value: string): string {
  const version = assertBoundedText(value, 64, 'policy_version is required')
  assert(/^[a-z0-9][a-z0-9._-]*$/.test(version), 422, 'policy_version must be an identifier')
  return version
}

export function assertTerritorialJurisdiction(value: unknown): TerritorialCopyrightJurisdiction {
  assert(value === 'eu_dsa' || value === 'uk', 422, 'jurisdiction is required')
  return value
}

export function assertStaffDisposition(value: unknown): CopyrightStaffDisposition {
  assert(value === 'maintain' || value === 'revoke', 422, 'staff_disposition is required')
  return value
}

export function assertReportingPeriod(start: Date, end: Date): void {
  assert(!Number.isNaN(start.getTime()), 422, 'period_start is required')
  assert(!Number.isNaN(end.getTime()), 422, 'period_end is required')
  assert(start < end, 422, 'period_end must be after period_start')
}

export function territorialRequestSha256(
  input: TerritorialNoticeRequest | EuTerritorialNoticeRequest,
): Buffer {
  return createHash('sha256')
    .update(
      JSON.stringify({
        contact: input.contact,
        contentDescription: input.contentDescription,
        grounds: input.grounds,
        hostedUseUrl: input.hostedUseUrl,
        ...('notifierName' in input
          ? {
              notifierName: input.notifierName,
              notifierEmail: input.notifierEmail,
              goodFaithStatement: input.goodFaithStatement,
            }
          : {}),
      }),
    )
    .digest()
}

export function sameSha256(stored: Uint8Array, expected: Buffer): boolean {
  return Buffer.from(stored).equals(expected)
}
