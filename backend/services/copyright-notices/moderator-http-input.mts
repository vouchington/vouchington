import type { Context } from '@jongleberry/api-server'
import { isUUID } from '@modules/utils'
import { boundedString, parseCopyrightTargetIds } from './http-input.mts'

export function parseCopyrightRecommendationId(
  ctx: Context,
  body: Record<string, unknown>,
): string | null {
  const value = body.recommendation_id
  ctx.assert(
    value === null || value === undefined || (typeof value === 'string' && isUUID(value)),
    422,
    'recommendation_id must be a UUID or null',
  )
  return (value as string | null | undefined) ?? null
}

export function parseCopyrightManualFallbackReason(
  ctx: Context,
  body: Record<string, unknown>,
): string | null {
  const value = body.manual_fallback_reason
  ctx.assert(
    value === null || value === undefined || boundedString(value, 10_000),
    422,
    'manual_fallback_reason must be a bounded string or null',
  )
  return (value as string | null | undefined) ?? null
}

export function parseCopyrightCorrespondenceSubmission(
  ctx: Context,
  body: Record<string, unknown>,
) {
  if (body.kind === 'appeal') {
    ctx.assert(boundedString(body.appeal_reason, 10_000), 422, 'appeal_reason is required')
    return {
      reason: body.appeal_reason,
      targetIds: parseCopyrightTargetIds(body.target_ids),
      rationale: body.rationale as string,
    }
  }
  if (body.kind === 'counter_notice') {
    ctx.assert(boundedString(body.name, 200), 422, 'name is required')
    ctx.assert(boundedString(body.address, 4096), 422, 'address is required')
    ctx.assert(boundedString(body.telephone, 200), 422, 'telephone is required')
    ctx.assert(
      body.consent_to_federal_jurisdiction === true,
      422,
      'consent_to_federal_jurisdiction must be accepted',
    )
    ctx.assert(
      body.consent_to_service_of_process === true,
      422,
      'consent_to_service_of_process must be accepted',
    )
    ctx.assert(
      body.good_faith_misidentification_under_penalty_of_perjury === true,
      422,
      'good_faith_misidentification_under_penalty_of_perjury must be accepted',
    )
    ctx.assert(
      boundedString(body.electronic_signature, 500),
      422,
      'electronic_signature is required',
    )
    return {
      name: body.name,
      address: body.address,
      telephone: body.telephone,
      consentToFederalJurisdiction: true as const,
      consentToServiceOfProcess: true as const,
      goodFaithMisidentificationUnderPenaltyOfPerjury: true as const,
      electronicSignature: body.electronic_signature,
      targetIds: parseCopyrightTargetIds(body.target_ids),
    }
  }
  ctx.assert(boundedString(body.submission_summary, 10_000), 422, 'submission_summary is required')
  return { summary: body.submission_summary }
}

export function parseCopyrightSimilarityCandidateLimit(value: unknown): number | undefined {
  if (value === undefined) return undefined
  const limit = typeof value === 'string' ? Number(value) : Number.NaN
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) return undefined
  return limit
}

export function parseNullableCopyrightDate(
  ctx: Context,
  value: unknown,
  field: string,
): Date | null {
  if (value === null || value === undefined) return null
  ctx.assert(typeof value === 'string', 422, `${field} must be an ISO date or null`)
  const parsed = new Date(value)
  ctx.assert(!Number.isNaN(parsed.getTime()), 422, `${field} must be an ISO date or null`)
  return parsed
}

export function parseNullableCopyrightEnum<const T extends readonly string[]>(
  ctx: Context,
  value: unknown,
  allowed: T,
  field: string,
): T[number] | null {
  if (value === null || value === undefined) return null
  ctx.assert(typeof value === 'string' && allowed.includes(value), 422, `${field} is invalid`)
  return value as T[number]
}
