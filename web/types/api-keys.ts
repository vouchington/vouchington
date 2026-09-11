export interface ApiKey {
  id: string
  prefix: string
  type: string
  label: string
  permissions: string[]
  created_at: string
  last_used_at: string | null
  revoked_at: string | null
  updated_at: string
}
