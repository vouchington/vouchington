import type { CommunityBanSummary, CommunityBansResponseBody } from '@/types/api-responses'

export function isBanActive(ban: CommunityBanSummary): boolean {
  return !ban.lifted_at && (!ban.expires_at || new Date(ban.expires_at) > new Date())
}

export function uniqueBans(bans: CommunityBanSummary[]): CommunityBanSummary[] {
  return [...new Map<string, CommunityBanSummary>(bans.map(ban => [ban.id, ban] as const)).values()]
}

export function collectBanUsers(
  pages: CommunityBansResponseBody[],
): CommunityBansResponseBody['users'] {
  const users: CommunityBansResponseBody['users'] = {}
  for (const page of pages) Object.assign(users, page.users)
  return users
}
