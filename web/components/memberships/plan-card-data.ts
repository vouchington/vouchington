export const PLAN_ORDER = ['plus', 'pro'] as const
export const MOST_POPULAR_PLAN = 'plus'
export const ENTITLED_STATUSES = new Set(['active', 'past_due'])
export const BILLING_MANAGEABLE_STATUSES = new Set(['active', 'past_due', 'paused'])

export interface PlanFeature {
  label: string
  tooltip?: string
  included: boolean
}
