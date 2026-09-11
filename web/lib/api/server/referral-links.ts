import { cache } from 'react'
import { serverApi } from './instance'
import { returnNullForMissingEntity } from '../return-null-for-missing-entity'
import type {
  PrioritizedReferralLinksResponse,
  ListResponse,
  UserReferralLinkWithDetails,
} from '@/types/api-responses'

export const getPrioritizedReferralLinks = cache(
  (referralProgramId: string): Promise<PrioritizedReferralLinksResponse> => {
    return serverApi.get<PrioritizedReferralLinksResponse>(
      `/api/v1/topics/${referralProgramId}/prioritized-referral-links`,
    )
  },
)

interface ReferralLinkResult {
  id: string
  url: string
  label: string | null
  referral_program_id: string
  user_id: string
}

export const getMyReferralLinks = cache(
  (referralProgramId: string): Promise<ListResponse<ReferralLinkResult> | null> => {
    return returnNullForMissingEntity(
      serverApi.get<ListResponse<ReferralLinkResult>>('/api/v1/referral-links', {
        searchParams: { referral_program_id: referralProgramId },
      }),
    )
  },
)

export const getAllMyReferralLinks = cache(
  (): Promise<ListResponse<UserReferralLinkWithDetails> | null> => {
    return returnNullForMissingEntity(
      serverApi.get<ListResponse<UserReferralLinkWithDetails>>('/api/v1/referral-links'),
    )
  },
)

export interface OfficialReferralLink {
  id: string
  url: string
  label: string | null
  activated_at: string | null
}

export const getOfficialReferralLinks = cache(
  (referralProgramId: string): Promise<{ official_referral_links: OfficialReferralLink[] }> => {
    return serverApi.get<{ official_referral_links: OfficialReferralLink[] }>(
      `/api/v1/referral-programs/${referralProgramId}/official-referral-links`,
    )
  },
)

export const getReferralProgramValidationInfo = cache(
  (
    referralProgramId: string,
  ): Promise<{ user_help_text: string; example_urls: string[] } | null> => {
    return returnNullForMissingEntity(
      serverApi
        .get<{ validation_info: { user_help_text: string; example_urls: string[] } }>(
          `/api/v1/topics/${referralProgramId}/referral-program/validation-info`,
        )
        .then(data => data.validation_info),
    )
  },
)

export interface ReferralLinkValidationSummary {
  id: string
  slug: string
  user_help_text: string
  updated_at: string
}

export const getReferralProgramValidations = cache(
  (referralProgramId: string): Promise<{ results: ReferralLinkValidationSummary[] }> => {
    return serverApi.get<{ results: ReferralLinkValidationSummary[] }>(
      `/api/v1/topics/${referralProgramId}/referral-program/validations`,
    )
  },
)
