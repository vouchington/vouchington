export const spendingFrequencyTypes = {
  monthly: { slug: 'monthly', label: 'Monthly' },
  annually: { slug: 'annually', label: 'Annually' },
} as const

export interface HouseholdRow {
  id: string
  owner_id: string
  created_at?: string
  updated_at: string
}

export interface HouseholdMembershipRow {
  id: string
  household_id: string
  relationship: string | null
  updated_at: string
  individual: {
    id: string
    user_id: string | null
    username: string | null
    updated_at: string
  }
}

export type HouseholdAccess = 'all' | 'owned' | 'member'

export type HouseholdListOptions = {
  access: HouseholdAccess
  after?: string
  limit: number
}

export type HouseholdMembershipListOptions = {
  after?: string
  limit: number
}
