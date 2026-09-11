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
      postType: input.source ?? 'discussion',
      policyRevision: 'unversioned',
    }
  )
}
