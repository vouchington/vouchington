/** REST twins that explicitly validate UUID paths in addition to their request contract. */
export const communityModerationUuidPaths: Readonly<Record<string, string>> = {
  claim_report: 'reportId',
  release_report_claim: 'reportId',
  escalate_report: 'reportId',
  deescalate_report: 'reportId',
  open_report_mod_internal_thread: 'reportId',
  resolve_report: 'reportId',
  lift_restriction: 'id',
  delete_saved_reply: 'id',
}
