/** REST twins that call validateUUIDParam in addition to their request contract. */
export const communityModerationUuidPaths: Readonly<Record<string, string>> = {
  claim_post: 'postId',
  release_post_claim: 'postId',
  escalate_post: 'postId',
  deescalate_post: 'postId',
  open_post_mod_internal_thread: 'postId',
  dismiss_automod_flag: 'postId',
  claim_report: 'reportId',
  release_report_claim: 'reportId',
  escalate_report: 'reportId',
  deescalate_report: 'reportId',
  open_report_mod_internal_thread: 'reportId',
  resolve_report: 'reportId',
  lift_ban: 'userId',
  dismiss_ban_evasion: 'userId',
  lift_restriction: 'id',
}
