export type CopyrightTrustedFlaggerCreateRequest = {
  name: string
  user_id: string
  awarding_coordinator_name: string
  awarding_member_state: string
  awarded_on: string
  area_of_expertise: 'intellectual_property' | 'other'
  area_description: string
  award_reference?: string | null
}

export type CopyrightTrustedFlaggerChangeRequest = {
  change_type: 'suspended' | 'reinstated' | 'revoked'
  reason: string
}
