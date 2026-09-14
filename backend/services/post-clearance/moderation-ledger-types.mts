export const POST_MODERATION_POLICY_REVISION = '2026-09-09.1'

export const AUTOMATED_POST_MODERATION_SOURCES = ['openai_omni', 'spam_detection'] as const

export type AutomatedPostModerationSource = (typeof AUTOMATED_POST_MODERATION_SOURCES)[number]
export type PostModerationSource = AutomatedPostModerationSource | 'staff'
export type PostModerationDisposition = 'pass' | 'review' | 'reject' | 'incomplete'

export type RecordPostModerationDisposition = {
  versionId: string
  source: PostModerationSource
  disposition: PostModerationDisposition
  reasonCode: string
  evidence?: Readonly<Record<string, unknown>>
  attemptId?: string
  actorUserId?: string
}
