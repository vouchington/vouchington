/** How many of one claimant's notices ended in each misuse outcome; evidence for a moderator only. */
export type CopyrightClaimantMisuse = {
  notice_withdrawn: number
  notice_rejected: number
  restriction_reversed_by_counter_notice: number
  restriction_reversed_by_appeal: number
}

/** The claimant of a staff queue case: who filed it and how their earlier notices ended. */
export type CopyrightStaffClaimant = {
  display_name: string | null
  contact: string
  misuse: CopyrightClaimantMisuse | null
}
