'use client'

import { clientApi } from './instance'

export async function createOfficialReferralLink(
  referralProgramId: string,
  body: { url: string; label?: string | null },
): Promise<{ official_referral_link: { id: string } }> {
  return clientApi.post<{ official_referral_link: { id: string } }>(
    `/api/v1/referral-programs/${referralProgramId}/official-referral-links`,
    body,
  )
}

export async function deleteOfficialReferralLink(linkId: string): Promise<void> {
  await clientApi.delete(`/api/v1/official-referral-links/${linkId}`)
}
