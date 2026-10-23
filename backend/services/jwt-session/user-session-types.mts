export type UserSessionRow = {
  id: string
  user_id: string
  device_id: string
  authentication_origin: 'web' | 'native'
  device_name: string
  user_agent: string
  ip_address: string | null
  created_at: Date
  last_seen_at: Date
  expires_at: Date
  revoked_at: Date | null
  mcp_connections?: {
    grant_id: string
    client_name: string
    attestation_status: 'attested' | 'unattested'
    last_minted_at: Date
  }[]
}
