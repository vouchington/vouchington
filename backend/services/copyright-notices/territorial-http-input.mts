import assert from 'http-assert'
import {
  assertBoundedText,
  assertStaffDisposition,
  type TerritorialNoticeRequest,
} from './territorial-fields.mts'

export function parseTerritorialNoticeBody(
  body: Record<string, unknown>,
): TerritorialNoticeRequest {
  assert(typeof body.contact === 'string', 422, 'contact is required')
  assert(typeof body.content_description === 'string', 422, 'content_description is required')
  assert(typeof body.grounds === 'string', 422, 'grounds are required')
  assert(typeof body.hosted_use_url === 'string', 422, 'hosted_use_url is required')
  return {
    contact: body.contact,
    contentDescription: body.content_description,
    grounds: body.grounds,
    hostedUseUrl: body.hosted_use_url,
  }
}

export function parseTerritorialText(body: Record<string, unknown>, field: string): string {
  const value = body[field]
  assert(typeof value === 'string', 422, `${field} is required`)
  return value
}

export function parseTerritorialRedressDecision(body: Record<string, unknown>): {
  disposition: ReturnType<typeof assertStaffDisposition>
  rationale: string
} {
  const disposition = assertStaffDisposition(body.staff_disposition)
  // The service rejects a blank rationale with this message; a non-string one is rejected here so
  // the generated request contract never answers it with a generic carrier message.
  assert(typeof body.rationale === 'string', 422, 'rationale is required')
  return { disposition, rationale: body.rationale }
}

export function parseTerritorialReportPeriod(body: Record<string, unknown>): {
  periodStartedAt: Date
  periodEndedAt: Date
} {
  assert(typeof body.period_start === 'string', 422, 'period_start is required')
  assert(typeof body.period_end === 'string', 422, 'period_end is required')
  return {
    periodStartedAt: new Date(body.period_start),
    periodEndedAt: new Date(body.period_end),
  }
}

export function parsePolicyVersion(body: Record<string, unknown>): string {
  assert(typeof body.policy_version === 'string', 422, 'policy_version is required')
  return assertBoundedText(body.policy_version, 64, 'policy_version is required')
}
