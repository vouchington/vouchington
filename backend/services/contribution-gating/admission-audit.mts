import type { ContributionAdmissionAudit } from './admission-reservations.mts'
import type { ContributionPolicySource } from './policy.mts'

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
