import assert from 'http-assert'
import { isEmailAddress } from '@ts-shared/utils/validation-core'
import {
  assertBoundedText,
  assertStaffDisposition,
  type TerritorialNoticeRequest,
  type EuTerritorialNoticeRequest,
} from './territorial-fields.mts'
import { parseCopyrightTargets } from './http-input.mts'
import type { CopyrightImageSelector } from './placement-resolution.mts'

type TerritorialPostTarget = Extract<CopyrightImageSelector, { surfaceKind: 'post-image' }>

export function parseTerritorialDecisionBody(
  body: Record<string, unknown>,
  textField: 'statement' | 'rationale',
): {
  text: string
  publicExplanation: string
  outcome: 'restrict' | 'no_action'
  targets: TerritorialPostTarget[]
} {
  const text = parseTerritorialText(body, textField)
  assert(typeof body.public_explanation === 'string', 422, 'public_explanation is required')
  const publicExplanation = assertBoundedText(
    body.public_explanation,
    2000,
    'public_explanation is required',
  )
  assert(body.outcome === 'restrict' || body.outcome === 'no_action', 422, 'outcome is required')
  if (body.outcome === 'no_action') {
    assert(body.targets === undefined, 422, 'no_action must not name targets')
    return { text, publicExplanation, outcome: body.outcome, targets: [] }
  }
  const targets = parseCopyrightTargets(body.targets)
  assert(
    targets.every(target => target.surfaceKind === 'post-image'),
    422,
    'targets must name post images',
  )
  return {
    text,
    publicExplanation,
    outcome: body.outcome,
    targets: targets as TerritorialPostTarget[],
  }
}

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

export function parseEuTerritorialNoticeBody(
  body: Record<string, unknown>,
): EuTerritorialNoticeRequest {
  const base = parseTerritorialNoticeBody(body)
  assert(typeof body.notifier_name === 'string', 422, 'notifier_name is required')
  assert(typeof body.notifier_email === 'string', 422, 'notifier_email is required')
  const notifierName = assertBoundedText(body.notifier_name, 200, 'notifier_name is required')
  const notifierEmail = assertBoundedText(body.notifier_email, 254, 'notifier_email is required')
  assert(isEmailAddress(notifierEmail), 422, 'notifier_email must be an email address')
  assert(body.has_good_faith_statement === true, 422, 'has_good_faith_statement must be true')
  return { ...base, notifierName, notifierEmail, goodFaithStatement: true }
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
