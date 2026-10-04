export type DsaCopyrightComplaintBucket = {
  received: number
  upheld: number
  partially_reversed: number
  reversed: number
  median_hours?: number
}

export type DsaCopyrightComplaintFigures = {
  complaints_by_submitter: { notifier: number; poster: number; reviewer: number }
  complaints_by_decision_type: {
    restrict: DsaCopyrightComplaintBucket
    no_action: DsaCopyrightComplaintBucket
    no_action_trusted_flagger: DsaCopyrightComplaintBucket
  }
}

export type DsaCopyrightNoticeFigures = {
  notices_received_count: number
  notices_received_trusted_flagger_count: number
  notified_items_count: number
  notified_items_trusted_flagger_count: number
  actions_on_law_count: number
  actions_on_law_trusted_flagger_count: number
  actions_on_terms_count: number
  actions_on_terms_trusted_flagger_count: number
  notices_processed_by_automated_means_count: number
  restrictions_imposed_by_automated_means_count: number
  median_hours_to_action?: number
  median_hours_to_action_trusted_flagger?: number
}
