import { isUUID } from '@modules/utils'
import assert from 'http-assert'
import type { EuDisputeSettlementResult } from './eu-dispute-settlement.mts'

export function parseEuDisputeSettlementReferral(body: Record<string, unknown>) {
  assert(typeof body.body_name === 'string', 422, 'body_name is required')
  assert(
    body.referred_by_party === 'poster' || body.referred_by_party === 'notifier',
    422,
    'referred_by_party is required',
  )
  assert(
    body.referred_by_id === undefined ||
      (typeof body.referred_by_id === 'string' && isUUID(body.referred_by_id)),
    422,
    'referred_by_id must be a UUID',
  )
  return {
    bodyName: body.body_name,
    referredAt: parseEuDisputeSettlementDate(body.referred_at, 'referred_at'),
    referredByParty: body.referred_by_party as 'poster' | 'notifier',
    referredByUserId: typeof body.referred_by_id === 'string' ? body.referred_by_id : null,
  }
}

export function parseEuDisputeSettlementOutcome(body: Record<string, unknown>): {
  result: EuDisputeSettlementResult
  decidedAt: Date
} {
  const result = body.result
  assert(
    result === 'decided_for_recipient' ||
      result === 'decided_for_platform' ||
      result === 'withdrawn' ||
      result === 'no_decision',
    422,
    'result is required',
  )
  return { result, decidedAt: parseEuDisputeSettlementDate(body.decided_at, 'decided_at') }
}

export function parseEuDisputeSettlementDate(value: unknown, field: string): Date {
  assert(typeof value === 'string', 422, `${field} is required`)
  const date = new Date(value)
  assert(!Number.isNaN(date.getTime()), 422, `${field} must be a date-time`)
  return date
}
