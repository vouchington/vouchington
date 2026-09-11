import { createCodedError } from '@modules/on-error/create-coded-error'
import { INVALID_INPUT } from '@modules/on-error/error-codes'
import type { TransactionQuery } from '@data-stores/psql'
import type { PrivateUser } from '@voucha/types/entities/user'
import {
  resolveAdmissionIdentity,
  runContributionAdmission,
  type ContributionAdmissionResult,
} from './admission.mts'
import { getContributionPolicyConfigSnapshot } from './limits-config.mts'
import type { ContributionLimitMembershipPlan } from './limit-types.mts'
import { createContributionPolicyActor } from './policy-actor.mts'
import { resolveContributionPolicy, type ContributionPolicySource } from './policy.mts'
import { trackContributionAdmissionIdentity } from '@services/analytics/contribution-admission'
import { createHash } from 'node:crypto'

export function contributionPolicySourceForPostType(
  postType: string | undefined,
  capacityExempt = false,
): ContributionPolicySource {
  if (capacityExempt && postType === 'article') return 'article'
  if (capacityExempt && postType === 'blog_post') return 'blog_post'
  if (postType === 'review') return 'review'
  if (postType === 'comment') return 'comment'
  if (postType === 'data_point') return 'data_point'
  if (postType === 'link') return 'link'
  return 'discussion'
}

export async function admitRouteContribution<T>(input: {
  currentUser: PrivateUser
  membershipPlan: ContributionLimitMembershipPlan
  source: ContributionPolicySource
  scope: string
  postType: string
  idempotencyKeyHeader: string | string[] | undefined
  intent: unknown
  beforeCapacity?: () => Promise<void>
  beforeCommit?: () => Promise<void>
  execute: (query: TransactionQuery) => Promise<T>
}): Promise<ContributionAdmissionResult<T>> {
  const header = parseIdempotencyKeyHeader(input.idempotencyKeyHeader)
  const identity = resolveAdmissionIdentity(header)
  const startedAt = Date.now()
  const capacityExempt = input.currentUser.roles.includes('administrator')
  const policy = capacityExempt
    ? undefined
    : resolveContributionPolicy(
        getContributionPolicyConfigSnapshot(),
        createContributionPolicyActor(input.currentUser.id, input.membershipPlan),
        input.source,
      )
  try {
    const result = await runContributionAdmission({
      actorId: input.currentUser.id,
      idempotencyKey: identity.idempotencyKey,
      callerCanReplayIdempotencyIdentity: identity.callerCanReplay,
      intent: normalizeRouteAdmissionIntent(input.intent),
      policy,
      source: input.source,
      audit: {
        route: admissionRoute(input.intent),
        scope: input.scope,
        source: input.source,
        postType: input.postType,
        policyRevision: capacityExempt
          ? 'capacity-exempt'
          : createHash('sha256').update(JSON.stringify(policy)).digest('hex'),
      },
      capacityExempt,
      beforeCapacity: input.beforeCapacity,
      beforeCommit: input.beforeCommit,
      execute: input.execute,
    })
    trackContributionAdmissionIdentity(
      input.source,
      identity.callerSupplied,
      result.kind,
      Date.now() - startedAt,
    )
    return result
  } catch (error) {
    trackContributionAdmissionIdentity(
      input.source,
      identity.callerSupplied,
      isIdempotencyMismatch(error) ? 'mismatch' : 'failed',
      Date.now() - startedAt,
    )
    throw error
  }
}

function isIdempotencyMismatch(error: unknown): boolean {
  return (
    error !== null &&
    typeof error === 'object' &&
    (error as { code?: unknown }).code === 'IDEMPOTENCY_KEY_REUSED'
  )
}

/** Excludes disposable challenge/honeypot inputs: retries with a refreshed token are one intent. */
export function normalizeRouteAdmissionIntent(intent: unknown): unknown {
  if (Array.isArray(intent)) return intent.map(normalizeRouteAdmissionIntent)
  if (intent !== null && typeof intent === 'object') {
    const normalized: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(intent as Record<string, unknown>)) {
      if (['cf_turnstile_response', 'recaptcha_token', 'hp_website', 'hp_phone'].includes(key))
        continue
      normalized[key] = normalizeRouteAdmissionIntent(value)
    }
    return normalized
  }
  return intent
}

function admissionRoute(intent: unknown): string {
  if (
    intent !== null &&
    typeof intent === 'object' &&
    typeof (intent as { route?: unknown }).route === 'string'
  )
    return (intent as { route: string }).route
  return 'authored.create'
}

export function parseIdempotencyKeyHeader(value: string | string[] | undefined): string | null {
  if (value === undefined) return null
  if (Array.isArray(value))
    throw createCodedError(400, 'Idempotency-Key must be a single UUID', INVALID_INPUT)
  return value
}
