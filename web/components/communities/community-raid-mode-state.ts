import type {
  CommunityRestriction,
  CommunityRestrictionsResponseBody,
  CommunityRestrictionType,
} from '@/types/api-responses'

export type DurationValue = '1h' | '6h' | '24h' | '72h' | 'manual'

export interface RaidModeState {
  selectedTypes: Set<CommunityRestrictionType>
  duration: DurationValue
  reason: string
  liftingId: string | null
  isSaving: boolean
}

type RaidModeAction =
  | { type: 'toggleRestriction'; restrictionType: CommunityRestrictionType; checked: boolean }
  | { type: 'setDuration'; duration: DurationValue }
  | { type: 'setReason'; reason: string }
  | { type: 'saving' }
  | { type: 'lifting'; liftingId: string }
  | { type: 'resetBusy' }

export const RESTRICTION_OPTIONS: Array<{
  type: CommunityRestrictionType
  label: string
}> = [
  { type: 'require_post_approval', label: 'Require post approval' },
  { type: 'no_new_member_posts', label: 'Block new member posts' },
  { type: 'no_links', label: 'Block links' },
  { type: 'approved_members_only', label: 'Approved members only' },
]

export const DURATION_OPTIONS: Array<{
  value: DurationValue
  label: string
  hours: number | null
}> = [
  { value: '1h', label: '1 hour', hours: 1 },
  { value: '6h', label: '6 hours', hours: 6 },
  { value: '24h', label: '24 hours', hours: 24 },
  { value: '72h', label: '72 hours', hours: 72 },
  { value: 'manual', label: 'Manual lift', hours: null },
]

export const initialRaidModeState: RaidModeState = {
  selectedTypes: new Set(['require_post_approval', 'no_new_member_posts']),
  duration: '24h',
  reason: '',
  liftingId: null,
  isSaving: false,
}

export function raidModeReducer(state: RaidModeState, action: RaidModeAction): RaidModeState {
  switch (action.type) {
    case 'toggleRestriction': {
      const selectedTypes = new Set(state.selectedTypes)
      if (action.checked) selectedTypes.add(action.restrictionType)
      else selectedTypes.delete(action.restrictionType)
      return { ...state, selectedTypes }
    }
    case 'setDuration': {
      return { ...state, duration: action.duration }
    }
    case 'setReason': {
      return { ...state, reason: action.reason }
    }
    case 'saving': {
      return { ...state, isSaving: true }
    }
    case 'lifting': {
      return { ...state, liftingId: action.liftingId }
    }
    case 'resetBusy': {
      return { ...state, isSaving: false, liftingId: null }
    }
  }
}

export function getActiveRestrictions(
  data: CommunityRestrictionsResponseBody,
): CommunityRestriction[] {
  const activeRestrictions: CommunityRestriction[] = []
  for (const result of data.results) {
    const restriction = data.community_restrictions[result.id]
    if (!restriction || restriction.lifted_at) continue
    if (restriction.expires_at && Date.parse(restriction.expires_at) <= Date.now()) continue
    activeRestrictions.push(restriction)
  }
  return activeRestrictions
}

export function getExpiresAt(duration: DurationValue): string | null {
  const option = DURATION_OPTIONS.find(item => item.value === duration)
  if (!option?.hours) return null
  return new Date(Date.now() + option.hours * 60 * 60 * 1000).toISOString()
}

export function formatRestrictionType(type: CommunityRestrictionType): string {
  switch (type) {
    case 'require_post_approval': {
      return 'Require post approval'
    }
    case 'no_new_member_posts': {
      return 'Block new member posts'
    }
    case 'no_links': {
      return 'Block links'
    }
    case 'approved_members_only': {
      return 'Approved members only'
    }
  }
}

export function formatRestrictionExpiry(expiresAt: string | null): string {
  if (!expiresAt) return 'Manual lift'
  return `Expires ${expiresAt.slice(0, 16).replace('T', ' ')} UTC`
}
