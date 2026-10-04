export type CopyrightEmailIntakeQueueItem = {
  id: string
  received_at: string
  // 'unparsed' means the inbound worker never recorded a parse; staff review the original email.
  parse_status: 'succeeded' | 'failed' | 'unparsed'
  recommendation_id: string | null
  review_path: 'initial' | 'unresolved_thread' | 'matched_thread'
  linked_notice_id: string | null
  // Why staff see it: still unreviewed, or the reply to its declined intake failed or bounced.
  waiting_reason: 'awaiting_review' | 'reply_failed' | 'reply_bounced'
  // `received_at` while unreviewed; the time the reply failed or bounced otherwise.
  waiting_since: string
}

export type CopyrightEmailIntakeQueuePage = {
  copyright_email_intakes: CopyrightEmailIntakeQueueItem[]
  page_info: {
    has_next_page: boolean
    start_cursor: string | null
    end_cursor: string | null
  }
}
