'use client'

import { clientApi } from './instance'

/** Marks a possible re-upload reviewed so it leaves the staff queue. */
export function reviewCopyrightStaydownMatch(
  noticeId: string,
  matchId: string,
): Promise<{ reviewed: boolean }> {
  return clientApi.post(
    `/api/v1/copyright-notices/${noticeId}/staydown-matches/${matchId}/reviews`,
    {},
  )
}
