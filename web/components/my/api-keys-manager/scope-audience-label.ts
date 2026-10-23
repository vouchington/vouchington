import type { MessageKey } from '@ts-shared/ui-messages'
import type { McpScopeAudience } from '@/types/scopes'

const AUDIENCE_LABEL_KEYS = {
  user: 'settings.apiKeys.audience.user',
  community_moderation: 'settings.apiKeys.audience.communityModeration',
  brand: 'settings.apiKeys.audience.brand',
  admin: 'settings.apiKeys.audience.admin',
  legal: 'settings.apiKeys.audience.legal',
} as const satisfies Record<McpScopeAudience, MessageKey>

export function scopeAudienceLabelKey(audience: McpScopeAudience): MessageKey {
  return AUDIENCE_LABEL_KEYS[audience]
}
