import type { ContributionStatusResponseBody } from '@/types/api-responses/urls-onboarding-and-trends'

export function isContributionGated(
  status: ContributionStatusResponseBody | null | undefined,
): status is ContributionStatusResponseBody {
  if (!status) return false

  return !status.contribution_status.allowed || !status.admission.allowed
}
