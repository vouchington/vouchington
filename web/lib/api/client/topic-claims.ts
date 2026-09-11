'use client'

import { clientApi } from './instance'
import type { TopicClaim } from '@/types/topic-claims'

export function createTopicClaim(
  topicIdOrSlug: string,
  data: {
    claimed_role: string
    evidence?: string
  },
): Promise<{ claim: TopicClaim; is_duplicate: boolean }> {
  return clientApi.post(`/api/v1/topics/${topicIdOrSlug}/claims`, data)
}

interface VerificationTokenResponse {
  raw_token: string
  dns_instructions: { record_type: 'TXT'; hostname: string; value: string }
  well_known_instructions: { url: string; file_content: string }
}

interface VerificationTokenApiResponse {
  rawToken: string
  dnsInstructions: { recordType: 'TXT'; hostname: string; value: string }
  wellKnownInstructions: { url: string; fileContent: string }
}

export async function issueVerificationToken(
  topicIdOrSlug: string,
  claimId: string,
): Promise<VerificationTokenResponse> {
  const response = await clientApi.post<VerificationTokenApiResponse>(
    `/api/v1/topics/${topicIdOrSlug}/claims/${claimId}/verification-token`,
    {},
  )
  return {
    raw_token: response.rawToken,
    dns_instructions: {
      record_type: response.dnsInstructions.recordType,
      hostname: response.dnsInstructions.hostname,
      value: response.dnsInstructions.value,
    },
    well_known_instructions: {
      url: response.wellKnownInstructions.url,
      file_content: response.wellKnownInstructions.fileContent,
    },
  }
}

export function verifyDomain(
  topicIdOrSlug: string,
  claimId: string,
): Promise<{ claim: TopicClaim }> {
  return clientApi.post(`/api/v1/topics/${topicIdOrSlug}/claims/${claimId}/domain-verification`, {})
}

export function submitForManualReview(
  topicIdOrSlug: string,
  claimId: string,
  evidence: string,
): Promise<{ claim: TopicClaim }> {
  return clientApi.post(
    `/api/v1/topics/${topicIdOrSlug}/claims/${claimId}/manual-review-submission`,
    { evidence },
  )
}

export function adminVerifyTopicClaim(claimId: string): Promise<{ claim: TopicClaim }> {
  return clientApi.post(`/api/v1/admin/topic-claims/${claimId}/verification`, {})
}

export function adminRejectTopicClaim(
  claimId: string,
  rejection_reason: string,
): Promise<{ claim: TopicClaim }> {
  return clientApi.post(`/api/v1/admin/topic-claims/${claimId}/rejection`, { rejection_reason })
}

export function adminRevokeTopicClaim(
  claimId: string,
  revocation_reason: string,
): Promise<{ claim: TopicClaim }> {
  return clientApi.post(`/api/v1/admin/topic-claims/${claimId}/revocation`, { revocation_reason })
}
