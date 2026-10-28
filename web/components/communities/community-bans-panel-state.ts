import type { CommunityBan } from '@/types/api-responses'

export function isBanActive(ban: CommunityBan): boolean {
  return !ban.lifted_at && (!ban.expires_at || new Date(ban.expires_at) > new Date())
}
