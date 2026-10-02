import type { ApiKeyType } from './format.mts'

export interface ApiKey {
  id: string
  user_id: string
  prefix: string
  type: ApiKeyType
  label: string
  permissions: string[]
  created_at: string
  last_used_at: string | null
  revoked_at: string | null
  expires_at: string | null
  replaced_by_api_key_id: string | null
  expiry_reminder_sent_at: string | null
  updated_at: string
}
