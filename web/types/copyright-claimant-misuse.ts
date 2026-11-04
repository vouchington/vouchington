/** Counts for one window of a claimant's notices. */
export type CopyrightClaimantMisuse = {
  notice_withdrawn: number
  notice_rejected: number
  restriction_reversed_by_counter_notice: number
  restriction_reversed_by_appeal: number
  notice_count: number
  oldest_notice_at: string | null
  newest_notice_at: string | null
  page_info: { has_next_page: boolean; start_cursor: string | null; end_cursor: string | null }
}

export type CopyrightStaffClaimant = {
  user_id: string | null
  display_name: string | null
  contact: string
  misuse: CopyrightClaimantMisuse | null
}
