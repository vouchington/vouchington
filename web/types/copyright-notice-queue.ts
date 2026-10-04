import type { CopyrightNoticesPage, CopyrightStaffQueueItem } from './copyright-notices'

export type CopyrightStaffQueueReason =
  | 'territorial_notice_review'
  | 'territorial_decision_reopened'
  | 'territorial_redress_review'
  | 'form_intake_review'
  | 'restriction_review'
  | 'appeal_review'
  | 'counter_notice_review'
  | 'legal_hold_review'
  | 'action_failed'
  | 'enforcement_pending'
  | 'delivery_failed'
  | 'staydown_review'
  | 'deadline_due'
  | 'deadline_missed'

export type CopyrightStaffQueuePage = {
  copyright_notices: CopyrightStaffQueueItem[]
  page_info: CopyrightNoticesPage['page_info']
}
