import type { AgentUser } from '@/types/agents'

/**
 * Resolves the best available display name for an agent's system user.
 * Preference: display_account.name > username > fallback
 */
export function getAgentDisplayName(user: AgentUser | null | undefined, fallback: string): string {
  return user?.display_account?.name ?? user?.username ?? fallback
}
