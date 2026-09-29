import type { CommunityBanEvasionContext, ModerationReport } from './config.mts'
import type { FullJudgementSummary } from './full-judgement-summary.mts'
import type { PostModerationContext } from './post-moderation-context.mts'
import type { ModerationReportTargetContent } from './target-metadata.mts'

export type PendingModerationReport = ModerationReport & {
  cursor_created_at: string
  admin_action_path: string | null
  target_label: string | null
  target_content: ModerationReportTargetContent | null
  target_path: string | null
  target_user_id: string | null
  target_available: boolean | null
  /** True when the target is a private-community or non-public (followers-only/private) post/comment. */
  target_is_restricted: boolean
  report_count: number
  cursor_report_count: number
  cursor_severity_rank: number
  judgement: FullJudgementSummary | null
  /** Full moderation context for post/comment targets (staff tier). Null for other entity types. */
  post_moderation_context: PostModerationContext | null
  /** True for post reports whose target still has no approved community publication row. */
  target_pending_community_review?: boolean
  /** True when the target post was submitted anonymously. */
  target_is_anonymous?: boolean
  is_system_generated: boolean
  /** Ban-evasion flag context for user-entity reports. */
  community_ban_evasion?: CommunityBanEvasionContext | null
}
