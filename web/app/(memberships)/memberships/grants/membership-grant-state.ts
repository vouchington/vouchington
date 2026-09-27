import type { MembershipPlanSku } from '@/types/api-responses'

export interface MembershipGrantState {
  userId: string
  plan: string
  skuId: string
  durationDays: string
  skuOptions: MembershipPlanSku[]
  loading: boolean
  successMessage: string
  errorMessage: string
  userKey: number // incremented after each grant to force-remount UserAutocomplete
}

export const initialMembershipGrantState: MembershipGrantState = {
  userId: '',
  plan: '',
  skuId: '',
  durationDays: '',
  skuOptions: [],
  loading: false,
  successMessage: '',
  errorMessage: '',
  userKey: 0,
}

export type MembershipGrantAction =
  | Partial<MembershipGrantState>
  | ((state: MembershipGrantState) => Partial<MembershipGrantState>)

export function membershipGrantReducer(
  state: MembershipGrantState,
  action: MembershipGrantAction,
): MembershipGrantState {
  return { ...state, ...(typeof action === 'function' ? action(state) : action) }
}

export function isValidDurationDays(value: string): boolean {
  const durationDays = Number(value)
  return Number.isInteger(durationDays) && durationDays >= 1 && durationDays <= 3660
}
