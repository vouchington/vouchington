import type { TransactionQuery } from '@data-stores/psql'
import { createCodedError } from '@modules/on-error/create-coded-error'
import { CONTRIBUTION_ADMISSION_IN_PROGRESS, FORBIDDEN } from '@modules/on-error/error-codes'
import { validateUUID } from '@modules/utils'
import type { PrivateUser } from '@voucha/types/entities/user'
import { admitRouteContribution } from './admit-route-contribution.mts'
import { assertCanContribute } from './assert.mts'
import type { ContributionLimitMembershipPlan } from './limit-types.mts'
import type { ContributionPolicySource } from './policy.mts'

/**
 * Admission for an authenticated, unsuspended delegated credential owner. The credential
 * replaces the interactive challenge; the owner's REST admission identity and capacity remain.
 */
export async function admitDelegatedContribution<T>(input: {
  authority: { kind: 'delegated'; credentialOwnerId: string }
  currentUser: PrivateUser
  membershipPlan: ContributionLimitMembershipPlan
  source: ContributionPolicySource
  scope: string
  postType: string
  idempotencyKey: string
  intent: unknown
  beforeCapacity?: () => Promise<void>
  execute: (query: TransactionQuery) => Promise<T>
}): Promise<T> {
  if (
    input.authority?.kind !== 'delegated' ||
    input.authority.credentialOwnerId !== input.currentUser.id
  )
    throw createCodedError(403, 'Delegated credential authority is required', FORBIDDEN)
  validateUUID(input.idempotencyKey)
  await assertCanContribute(input.currentUser, { membershipPlan: input.membershipPlan })
  const admission = await admitRouteContribution({
    ...input,
    idempotencyKeyHeader: input.idempotencyKey,
  })
  if (admission.kind === 'in_progress') {
    throw Object.assign(
      createCodedError(
        409,
        'This contribution is still being processed. Please retry.',
        CONTRIBUTION_ADMISSION_IN_PROGRESS,
      ),
      { retryAfterSeconds: admission.retryAfterSeconds },
    )
  }
  return admission.response
}
