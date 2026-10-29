'use client'

import { clientApi } from './instance'

export type CopyrightNoticeAssociationChoice = {
  id: string
  jurisdiction: 'us_dmca' | 'eu_dsa'
  received_at: string
  claimant_display_name: string | null
  work_description: string
}

export function searchCopyrightNoticeAssociationTargets(
  q: string,
  after?: string,
  signal?: AbortSignal,
): Promise<{
  copyright_notices: CopyrightNoticeAssociationChoice[]
  page_info: { has_next_page: boolean; end_cursor: string | null; start_cursor: string | null }
}> {
  return clientApi.get('/api/v1/copyright-notices/association-targets', {
    searchParams: { q, after },
    signal,
  })
}
