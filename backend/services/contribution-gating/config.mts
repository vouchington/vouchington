import type { MembershipPlanSlug } from '@services/memberships/types'

export const CONTRIBUTION_GATE_ACCOUNT_AGE_MS = 7 * 24 * 60 * 60 * 1000
export const CONTRIBUTION_ADMISSION_CLAIM_SECONDS = 30

export const DAILY_QUOTAS: Record<MembershipPlanSlug | 'free' | 'administrator', number> = {
  free: 10,
  plus: 50,
  pro: 100,
  administrator: Infinity,
} as const
