import { hashToken } from '@modules/token-secrets'

export function hashCommunityInviteCode(code: string): string {
  return hashToken('community-invite-code', code.toLowerCase())
}
