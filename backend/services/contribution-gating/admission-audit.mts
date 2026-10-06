import type { ContributionPolicySource } from './policy.mts'

/**
 * The ledger row's audit columns. A post admission names its policy source, post type and policy
 * revision; a keyed create of any other entity has none of them, so all three are null together.
 */
export type ContributionAdmissionAudit = Readonly<{
  route: string
  scope: string
  source: string | null
  postType: string | null
  policyRevision: string | null
}>

export function normalizeContributionAdmissionAudit(input: {
  audit?: ContributionAdmissionAudit
  source?: ContributionPolicySource
}): ContributionAdmissionAudit {
  return (
    input.audit ?? {
      route: 'internal',
      scope: 'internal',
      source: input.source ?? 'discussion',
      postType:
        input.source === 'rss_item_discussion' ? 'discussion' : (input.source ?? 'discussion'),
      policyRevision: 'unversioned',
    }
  )
}

/** Persist only the closed category; the full scope remains in exact replay metadata. */
export function contributionAdmissionScopeCategory(scope: string): string {
  return scope.split(':', 1)[0]!
}
