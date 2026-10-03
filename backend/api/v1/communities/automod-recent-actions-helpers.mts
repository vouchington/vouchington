import type {
  AutomodFeedbackAction,
  AutomodFeedbackOutcome,
  RecentAutomodActionSourceType,
} from '@services/moderation-training'

export function parseWindowHours(value: unknown): number {
  if (value === '24h') return 24
  if (value === '7d') return 24 * 7
  return 48
}

export function parseLimit(value: unknown): number {
  if (value === undefined) return 25
  const limit = Number(value)
  return Number.isFinite(limit) && limit > 0 ? Math.min(Math.floor(limit), 100) : 25
}

export function parseMaxConfidence(value: unknown): number | null {
  if (value === undefined || value === null || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

export function parseSourceType(value: unknown): RecentAutomodActionSourceType | null {
  return typeof value === 'string' && isRecentAutomodActionSourceType(value) ? value : null
}

export function parsePostType(value: unknown): string | null {
  return typeof value === 'string' && isRecentAutomodPostType(value) ? value : null
}

function isRecentAutomodActionSourceType(value: string): value is RecentAutomodActionSourceType {
  return (
    value === 'agent_moderation' ||
    value === 'openai_omni' ||
    value === 'spam_detection' ||
    value === 'community_prompt'
  )
}

function isRecentAutomodPostType(value: string) {
  return (
    value === 'discussion' ||
    value === 'review' ||
    value === 'data_point' ||
    value === 'story' ||
    value === 'topic_recommendation' ||
    value === 'comment' ||
    value === 'article' ||
    value === 'blog_post'
  )
}

export function isAutomodFeedbackOutcome(value: unknown): value is AutomodFeedbackOutcome {
  return value === 'false_positive' || value === 'true_positive'
}

export function isAutomodFeedbackAction(value: unknown): value is AutomodFeedbackAction {
  return value === 'reinstate' || value === 'keep_removed' || value === 'label_only'
}
