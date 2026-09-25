'use client'

import { clientApi } from './instance'

export type CopyrightRepeatInfringerAccountRecord = {
  account_user_id: string
  incident_id: string
  operative: boolean
  open_review_id: string | null
  termination_in_effect: boolean
}

export function listCopyrightRepeatInfringerAccounts(noticeId: string): Promise<{
  copyright_repeat_infringer_accounts: CopyrightRepeatInfringerAccountRecord[]
}> {
  return clientApi.get(`/api/v1/copyright-notices/${noticeId}/repeat-infringer-accounts`)
}

export function recordCopyrightRepeatInfringerDisposition(
  incidentId: string,
  disposition: 'withdrawn' | 'duplicate' | 'abusive',
  rationale: string,
): Promise<void> {
  return clientApi.post(`/api/v1/copyright-repeat-infringer-incidents/${incidentId}/dispositions`, {
    disposition,
    rationale,
  })
}

export function recordCopyrightRepeatInfringerReviewOutcome(
  reviewId: string,
  outcome: 'warning' | 'no_action' | 'restrict' | 'terminate',
  rationale: string,
): Promise<void> {
  return clientApi.post(`/api/v1/copyright-repeat-infringer-reviews/${reviewId}/outcomes`, {
    outcome,
    rationale,
  })
}

export function recordCopyrightRepeatInfringerReinstatement(
  accountUserId: string,
  rationale: string,
): Promise<void> {
  return clientApi.post(
    `/api/v1/copyright-repeat-infringer-accounts/${accountUserId}/reinstatements`,
    { rationale },
  )
}
