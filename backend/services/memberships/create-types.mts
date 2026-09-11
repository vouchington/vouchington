import type { QueryExecutor } from '@data-stores/psql'
import type { CreatedMembership } from './reconcile-source-projection.mts'
import type { MembershipPlanSlug, MembershipStatus } from './types.mts'

export const DEFAULT_STRIPE_MEMBERSHIP_APPLICATION_CONTEXT = {
  applicationId: 'voucha-web',
} as const

export type StripeMembershipApplicationContext = {
  applicationId: string
}

export type MembershipProvider = 'stripe' | 'apple_app_store' | 'google_play' | 'microsoft_store'

export type MembershipProviderSourceKind = 'direct' | 'family'

export type MembershipProviderSourceIdentity = {
  provider: MembershipProvider
  environment: 'test' | 'production'
  applicationId: string
  providerLineageId: string
  providerAccountId?: string | null
}

export type StripeMembershipSourceIdentity = MembershipProviderSourceIdentity & {
  provider: 'stripe'
}

export function getStripeMembershipSourceIdentity(options: {
  stripeSubscriptionId: string
  providerEnvironment?: 'test' | 'production'
  providerApplicationId?: string
  stripeCustomerId?: string | null
}): StripeMembershipSourceIdentity {
  return {
    provider: 'stripe',
    environment: options.providerEnvironment ?? 'production',
    applicationId:
      options.providerApplicationId ?? DEFAULT_STRIPE_MEMBERSHIP_APPLICATION_CONTEXT.applicationId,
    providerLineageId: options.stripeSubscriptionId,
    providerAccountId: options.stripeCustomerId,
  }
}

export type CreateProviderMembershipSourceOptions = {
  userId: string
  sourceKind: MembershipProviderSourceKind
  sourceIdentity: MembershipProviderSourceIdentity
  /**
   * Stripe's originating invoice is immutable once observed for a direct lineage. Other
   * providers must not use this Stripe-only field.
   */
  stripeOriginatingInvoiceId?: string
}

type CreateMembershipBase = {
  userId: string
  plan: MembershipPlanSlug
  skuId: string
  expiresAt?: Date | null
  effectiveAt?: Date
  sourceEffectiveAt?: Date
  sourceAutoRenews?: boolean
  observedAt?: Date
  terminalEffectiveAt?: Date
  stripeCustomerId?: string | null
  stripeOriginatingInvoiceId?: string
  providerEnvironment?: 'test' | 'production'
  providerApplicationId?: string
  grantedById?: string | null
  status?: MembershipStatus
  cancelAtPeriodEnd?: boolean
  stripeEventId?: string | null
  note?: string
}

type CreateProviderMembership = CreateMembershipBase & {
  stripeSubscriptionId: string
  durationDays?: never
}

type CreateGrantMembership = CreateMembershipBase & {
  stripeSubscriptionId?: null
  durationDays: number
}

export type CreateMembershipOptions = CreateProviderMembership | CreateGrantMembership

export type ResolvedMembershipProviderEvidence = {
  membershipProviderEvidenceId: string
  cancelAtPeriodEnd?: boolean
}

export type MembershipProviderEvidenceDependency =
  | {
      getMembershipProviderEvidence?: (
        membership: Pick<CreatedMembership, 'id'>,
        query: QueryExecutor,
      ) => Promise<ResolvedMembershipProviderEvidence>
      membershipProviderEvidenceId?: never
    }
  | {
      getMembershipProviderEvidence?: never
      membershipProviderEvidenceId?: string | null
    }
