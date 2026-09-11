export interface MfaStatus {
  has_mfa: boolean
  passkeys_count: number
  totp_count: number
}

export interface TotpAuthenticator {
  id: string
  name: string
  created_at: string
}
