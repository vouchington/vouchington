import type { CommunityAutomodAction } from '@/types/api-responses'

export type PendingAutomodReviewAction = 'reinstate' | 'keep_removed' | 'label_only'

export const AUTOMOD_REVIEW_REASON_CODES = [
  { value: 'correct', label: 'Correct' },
  { value: 'too_strict', label: 'Too strict' },
  { value: 'wrong_policy', label: 'Wrong policy' },
  { value: 'missing_context', label: 'Missing context' },
]

export function formatAutomodSource(action: CommunityAutomodAction): string {
  if (action.source_type === 'community_prompt' && action.moderator_slug) {
    return `Prompt: ${formatSlug(action.moderator_slug)}`
  }
  if (action.moderator_slug) return formatSlug(action.moderator_slug)
  return action.source_type === 'openai_omni'
    ? 'OpenAI Omni'
    : action.source_type === 'spam_detection'
      ? 'Spam detection'
      : 'Agent moderation'
}

export function formatAutomodCurrentState(state: CommunityAutomodAction['current_state']): string {
  return state === 'in_review' ? 'In review' : state === 'unpublished' ? 'Unpublished' : 'Rejected'
}

export function formatAutomodConfidence(score: number): string {
  return `${Math.round(score * 100)}% confidence`
}

function formatSlug(slug: string): string {
  return slug
    .split('-')
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}
