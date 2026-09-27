import type { MessageKey } from '@ts-shared/ui-messages'
import type { ScopeDescriptionKey } from '@/types/scopes'

const MESSAGE_KEYS = {
  mcp_admin_full_access: 'scopeDescription.mcpAdminFullAccess',
  mcp_user_full_access: 'scopeDescription.mcpUserFullAccess',
} satisfies Record<ScopeDescriptionKey, MessageKey>

/** Maps stable catalogue metadata to this client's localized copy without rendering server text. */
export function scopeDescriptionMessageKey(descriptionKey: ScopeDescriptionKey): MessageKey {
  const messageKey = MESSAGE_KEYS[descriptionKey]
  if (messageKey === undefined) {
    throw new Error(`Unknown scope description key: ${descriptionKey}`)
  }
  return messageKey
}
