'use client'

import { clientApi } from './instance'

export interface ReferralLinkValidation {
  id: string
  slug: string
  user_help_text: string
  updated_at: string
}

export interface ReferralLinkValidationRule {
  id: string
  referral_program_link_validation_id: string
  hostname: string
  pathname: string
  is_referral_link_url: boolean
  is_invalid_referral_link_url: boolean
  user_error_text: string | null
  example_urls: string[] | null
}

export function listReferralLinkValidations(options?: {
  limit?: number
  search?: string
}): Promise<{ results: ReferralLinkValidation[] }> {
  return clientApi.get('/api/v1/referral-link-validations', {
    searchParams: {
      limit: options?.limit ?? 100,
      ...(options?.search ? { search: options.search } : {}),
    },
  })
}

export function getReferralLinkValidation(
  idOrSlug: string,
): Promise<{ validation: ReferralLinkValidation }> {
  return clientApi.get(`/api/v1/referral-link-validations/${idOrSlug}`)
}

export function createReferralLinkValidation(data: {
  slug: string
  user_help_text?: string
}): Promise<{ validation: ReferralLinkValidation }> {
  return clientApi.post('/api/v1/referral-link-validations', data)
}

export function updateReferralLinkValidation(
  idOrSlug: string,
  data: { slug?: string; user_help_text?: string },
): Promise<{ validation: ReferralLinkValidation }> {
  return clientApi.patch(`/api/v1/referral-link-validations/${idOrSlug}`, data)
}

export function deleteReferralLinkValidation(idOrSlug: string): Promise<void> {
  return clientApi.delete(`/api/v1/referral-link-validations/${idOrSlug}`)
}

export function getReferralLinkValidationRules(
  validationId: string,
): Promise<{ results: ReferralLinkValidationRule[] }> {
  return clientApi.get(`/api/v1/referral-link-validations/${validationId}/rules`, {
    searchParams: { limit: 100 },
  })
}

export function createReferralLinkValidationRule(
  validationId: string,
  data: {
    hostname: string
    pathname: string
    is_referral_link_url?: boolean
    is_invalid_referral_link_url?: boolean
    user_error_text?: string | null
    example_urls?: string[] | null
  },
): Promise<{ validation_rule: ReferralLinkValidationRule }> {
  return clientApi.post(`/api/v1/referral-link-validations/${validationId}/rules`, data)
}

export function updateReferralLinkValidationRule(
  validationId: string,
  ruleId: string,
  data: {
    hostname?: string
    pathname?: string
    is_referral_link_url?: boolean
    is_invalid_referral_link_url?: boolean
    user_error_text?: string | null
    example_urls?: string[] | null
  },
): Promise<{ validation_rule: ReferralLinkValidationRule }> {
  return clientApi.patch(`/api/v1/referral-link-validations/${validationId}/rules/${ruleId}`, data)
}

export function deleteReferralLinkValidationRule(
  validationId: string,
  ruleId: string,
): Promise<void> {
  return clientApi.delete(`/api/v1/referral-link-validations/${validationId}/rules/${ruleId}`)
}

export function createAndLinkValidationToReferralProgram(
  referralProgramId: string,
  data: { slug: string; user_help_text?: string },
): Promise<{ validation: ReferralLinkValidation }> {
  return clientApi.post(`/api/v1/topics/${referralProgramId}/referral-program/validations`, data)
}

export function linkValidationToReferralProgram(
  referralProgramId: string,
  validationId: string,
): Promise<void> {
  return clientApi.post(`/api/v1/topics/${referralProgramId}/referral-program/link-validations`, {
    validation_id: validationId,
  })
}

export function unlinkValidationFromReferralProgram(
  referralProgramId: string,
  validationId: string,
): Promise<void> {
  return clientApi.delete(
    `/api/v1/topics/${referralProgramId}/referral-program/link-validations/${validationId}`,
  )
}
