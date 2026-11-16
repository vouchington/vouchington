import createHttpError from 'http-errors'
import { beginTransaction, type QueryExecutor } from '@data-stores/psql'
import { registerEntitlementEffectsAfterCommit } from './entitlement-effects-after-commit.mts'
import type {
  CreateMembershipOptions,
  MembershipProviderEvidenceDependency,
} from './create-types.mts'
import { createMembershipWithQuery } from './create/persist.mts'
import { getDirectTermEffectiveAt } from './direct-term-effective-at.mts'
import type { CreatedMembership } from './reconcile-source-projection.mts'

type CreateMembershipDependencies = {
  query?: QueryExecutor
} & MembershipProviderEvidenceDependency

export async function createMembership(
  options: CreateMembershipOptions,
  dependencies: CreateMembershipDependencies = {},
): Promise<CreatedMembership> {
  try {
    return await createMembershipInTransaction(options, dependencies)
  } catch (err) {
    if (
      !options.stripeSubscriptionId &&
      typeof err === 'object' &&
      err !== null &&
      'code' in err &&
      err.code === '23505' &&
      'constraint' in err &&
      (err.constraint === 'idx_membership_grant_activation_periods__open_user' ||
        err.constraint === 'idx_memberships__effective_user')
    )
      throw createHttpError(409, 'Concurrent membership grant issuance', {
        code: 'MEMBERSHIP_GRANT_CONFLICT',
        cause: err,
      })
    throw err
  }
}

async function createMembershipInTransaction(
  options: CreateMembershipOptions,
  dependencies: CreateMembershipDependencies,
): Promise<CreatedMembership> {
  const status = options.status ?? 'active'
  const effectiveAt = options.effectiveAt ?? new Date()
  const timingContext = {
    status,
    effectiveAt,
    directTermEffectiveAt: getDirectTermEffectiveAt(options, status, effectiveAt),
  }

  let membership: CreatedMembership
  if (dependencies.query) {
    membership = await createMembershipWithQuery(
      options,
      dependencies,
      timingContext,
      dependencies.query,
    )
    if (membership.projected) registerEntitlementEffectsAfterCommit(dependencies.query)
  } else {
    await using transaction = await beginTransaction()
    membership = await createMembershipWithQuery(options, dependencies, timingContext, transaction)
    if (membership.projected) registerEntitlementEffectsAfterCommit(transaction)
    await transaction.commit()
  }
  return membership
}
