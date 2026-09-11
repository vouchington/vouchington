import type { CommunityBan, CommunityBansResponseBody, PageInfo } from '@/types/api-responses'
import type { PublicUser } from '@/types/user'

export interface BansState {
  bans: CommunityBan[]
  users: Record<string, PublicUser>
  pageInfo: PageInfo
  loadingMore: boolean
  liftingUserId: string | null
  error: string | null
}

export type BansAction =
  | { type: 'load-start' }
  | { type: 'load-ok'; bans: CommunityBan[]; users: Record<string, PublicUser>; pageInfo: PageInfo }
  | { type: 'load-err'; error: string }
  | { type: 'lift-start'; userId: string }
  | { type: 'lift-done'; userId: string }
  | { type: 'lift-err'; error: string }

export function bansReducer(state: BansState, action: BansAction): BansState {
  switch (action.type) {
    case 'load-start': {
      return { ...state, loadingMore: true, error: null }
    }
    case 'load-ok': {
      return {
        ...state,
        loadingMore: false,
        bans: [...state.bans, ...action.bans],
        users: { ...state.users, ...action.users },
        pageInfo: action.pageInfo,
      }
    }
    case 'load-err': {
      return { ...state, loadingMore: false, error: action.error }
    }
    case 'lift-start': {
      return { ...state, liftingUserId: action.userId, error: null }
    }
    case 'lift-done': {
      return { ...state, liftingUserId: null, bans: liftBanInState(state.bans, action.userId) }
    }
    case 'lift-err': {
      return { ...state, liftingUserId: null, error: action.error }
    }
  }
}

export function initBansState(initialData: CommunityBansResponseBody): BansState {
  return {
    bans: initialData.results.flatMap(r => {
      const ban = initialData.community_bans[r.id]
      return ban ? [ban] : []
    }),
    users: initialData.users,
    pageInfo: initialData.page_info,
    loadingMore: false,
    liftingUserId: null,
    error: null,
  }
}

function liftBanInState(bans: CommunityBan[], userId: string): CommunityBan[] {
  const now = new Date().toISOString()
  // Only the currently-active ban is lifted; a prior naturally-expired row (also lifted_at null)
  // must keep its expiry semantics rather than being mislabeled as manually lifted.
  return bans.map(b => (b.user_id === userId && isBanActive(b) ? { ...b, lifted_at: now } : b))
}

export function isBanActive(ban: CommunityBan): boolean {
  return !ban.lifted_at && (!ban.expires_at || new Date(ban.expires_at) > new Date())
}
