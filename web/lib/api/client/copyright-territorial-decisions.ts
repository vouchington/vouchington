'use client'

import { clientApi } from './instance'

export type CopyrightTerritorialJurisdiction = 'eu_dsa' | 'uk'
export type CopyrightTerritorialPostTarget = {
  surface: 'post-image'
  post_id: string
  image_id: string
  target_url: string
}
export type CopyrightTerritorialDecisionInput = {
  text: string
  publicExplanation: string
  outcome: 'restrict' | 'no_action'
  targets?: CopyrightTerritorialPostTarget[]
}

/** Staff-only decision; the two jurisdictions have separate established request field names. */
export function decideCopyrightTerritorialNotice(
  jurisdiction: CopyrightTerritorialJurisdiction,
  noticeId: string,
  input: CopyrightTerritorialDecisionInput,
): Promise<void> {
  const base = jurisdiction === 'eu_dsa' ? 'copyright-eu-notices' : 'copyright-uk-notices'
  const field = jurisdiction === 'eu_dsa' ? 'statement' : 'rationale'
  const route = jurisdiction === 'eu_dsa' ? 'statements-of-reasons' : 'reviews'
  const body = {
    [field]: input.text,
    public_explanation: input.publicExplanation,
    outcome: input.outcome,
    ...(input.outcome === 'restrict' ? { targets: input.targets } : {}),
  }
  return clientApi.post(`/api/v1/${base}/${noticeId}/${route}`, body)
}

export function recordCopyrightTerritorialAcknowledgmentFailure(
  jurisdiction: CopyrightTerritorialJurisdiction,
  noticeId: string,
): Promise<void> {
  const base = jurisdiction === 'eu_dsa' ? 'copyright-eu-notices' : 'copyright-uk-notices'
  return clientApi.post(`/api/v1/${base}/${noticeId}/acknowledgment-failures`)
}
