import type { CommunityBanSummary, CommunityBansResponseBody } from '@/types/api-responses'

export function isBanActive(ban: CommunityBanSummary): boolean {
  return !ban.lifted_at && (!ban.expires_at || new Date(ban.expires_at) > new Date())
}

export function uniqueBans(bans: CommunityBanSummary[]): CommunityBanSummary[] {
  return [...new Map(bans.map(ban => [ban.id, ban])).values()]
}

export function collectBanUsers(
  pages: CommunityBansResponseBody[],
): CommunityBansResponseBody['users'] {
  return Object.assign({}, ...pages.map(page => page.users))
}
