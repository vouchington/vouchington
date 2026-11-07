import type { CommunityBanSummary } from '@/types/api-responses'

export function isBanActive(ban: CommunityBanSummary): boolean {
  return !ban.lifted_at && (!ban.expires_at || new Date(ban.expires_at) > new Date())
}
