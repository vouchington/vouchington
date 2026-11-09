import type { ModerationJudgementAction } from '@ts-shared/utils/moderation-policy'

/** Judgement summary for staff/moderator-tier viewers (the only tier that receives it). */
export interface FullJudgementSummary {
  id: string
  recommended_action: ModerationJudgementAction
  public_response: string
  internal_response: string
  is_stale: boolean
  judged_report_count: number | null
  judged_report_count_capped: boolean
  current_report_count: number
  current_report_count_capped: boolean
}
