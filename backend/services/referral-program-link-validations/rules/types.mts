export type ReferralLinkValidationRule = {
  id: string
  referral_program_link_validation_id: string
  hostname: string
  pathname: string
  is_referral_link_url: boolean
  is_invalid_referral_link_url: boolean
  user_error_text: string | null
  example_urls: string[] | null
  created_at: string
  updated_at: string
}
