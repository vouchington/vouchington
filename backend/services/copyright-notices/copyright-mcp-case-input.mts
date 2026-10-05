import assert from 'http-assert'
import { isUUID } from '@modules/utils'
import { boundedString, parseCopyrightTargetIds } from './http-input.mts'

export function parseCopyrightAppealDecisionInput(body: Record<string, unknown>) {
  const rawDecisions = body.decisions
  assert(
    Array.isArray(rawDecisions) && rawDecisions.length > 0 && rawDecisions.length <= 20,
    422,
    'decisions are required',
  )
  const decisions = rawDecisions.map(value => {
    assert(
      value && typeof value === 'object' && !Array.isArray(value),
      422,
      'decision must be an object',
    )
    const decision = value as Record<string, unknown>
    assert(
      typeof decision.restriction_id === 'string' && isUUID(decision.restriction_id),
      422,
      'restriction_id must be a UUID',
    )
    assert(
      decision.action === 'confirm' || decision.action === 'reverse',
      422,
      'action must be confirm or reverse',
    )
    return {
      restrictionId: decision.restriction_id,
      action: decision.action as 'confirm' | 'reverse',
    }
  })
  const recommendationId = body.recommendation_id
  assert(
    recommendationId === undefined ||
      recommendationId === null ||
      (typeof recommendationId === 'string' && isUUID(recommendationId)),
    422,
    'recommendation_id must be a UUID or null',
  )
  const manualFallbackReason = body.manual_fallback_reason
  assert(
    manualFallbackReason === undefined ||
      manualFallbackReason === null ||
      boundedString(manualFallbackReason, 10_000),
    422,
    'manual_fallback_reason must be a bounded string or null',
  )
  const parsedRecommendationId = (recommendationId as string | null | undefined) ?? null
  const parsedManualFallbackReason = (manualFallbackReason as string | null | undefined) ?? null
  assert(
    (parsedRecommendationId === null) !== (parsedManualFallbackReason === null),
    422,
    'Provide either recommendation_id or manual_fallback_reason',
  )
  return {
    decisions,
    recommendationId: parsedRecommendationId,
    manualFallbackReason: parsedManualFallbackReason,
  }
}

function nullableEnum<const T extends readonly string[]>(
  value: unknown,
  allowed: T,
  field: string,
): T[number] | null {
  if (value === undefined || value === null) return null
  assert(typeof value === 'string' && allowed.includes(value), 422, `${field} is invalid`)
  return value as T[number]
}

function nullableDate(value: unknown, field: string): Date | null {
  if (value === undefined || value === null) return null
  assert(typeof value === 'string', 422, `${field} must be an ISO date or null`)
  const parsed = new Date(value)
  assert(!Number.isNaN(parsed.getTime()), 422, `${field} must be an ISO date or null`)
  return parsed
}

export function parseCopyrightLegalHoldAssessmentInput(body: Record<string, unknown>) {
  assert(
    typeof body.is_from_original_claimant === 'boolean',
    422,
    'is_from_original_claimant is required',
  )
  assert(typeof body.is_same_material === 'boolean', 422, 'is_same_material is required')
  const proceedingKind = nullableEnum(
    body.proceeding_kind,
    ['federal_court', 'ccb'] as const,
    'proceeding_kind',
  )
  const ccbClaimKind = nullableEnum(
    body.ccb_claim_kind,
    ['claim', 'counterclaim'] as const,
    'ccb_claim_kind',
  )
  const commencedAt = nullableDate(body.commenced_at, 'commenced_at')
  const receivedByDesignatedAgentAt = nullableDate(
    body.received_by_designated_agent_at,
    'received_by_designated_agent_at',
  )
  assert(
    (proceedingKind === null && commencedAt === null) ||
      (proceedingKind !== null && commencedAt !== null),
    422,
    'commenced_at is required for a proceeding',
  )
  assert(
    (proceedingKind === 'ccb' && ccbClaimKind !== null) ||
      (proceedingKind !== 'ccb' && ccbClaimKind === null),
    422,
    'ccb_claim_kind is required only for a CCB proceeding',
  )
  return {
    proceedingKind,
    ccbClaimKind,
    commencedAt,
    receivedByDesignatedAgentAt,
    targetIds: parseCopyrightTargetIds(body.target_ids),
  }
}
