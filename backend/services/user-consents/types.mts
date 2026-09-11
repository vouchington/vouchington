export type ConsentType = 'privacy_policy' | 'terms_of_service' | 'cookie_analytics'

export type UserConsent = {
  id: string
  user_id: string
  consent_type: ConsentType
  version: string
  created_at: Date
  revoked_at: Date | null
}
