import { toast } from 'sonner'
import type { PostType } from '@/types/posts'
import type { ReviewTopicEntry } from '../post-form-sections'
import {
  REVIEW_MIN_CHARACTERS,
  REVIEW_MIN_SENTENCES,
  REVIEW_MIN_WORDS,
} from '@ts-shared/utils/validation-core'

export function validatePostForm({
  dataPointVertical,
  isEdit,
  isSubmitting,
  isUploading,
  markdown,
  postType,
  reviewContentValid,
  reviewTopics,
}: {
  dataPointVertical: string | null
  isEdit: boolean
  isSubmitting: boolean
  isUploading: boolean
  markdown: string
  postType: PostType
  reviewContentValid: boolean
  reviewTopics: ReviewTopicEntry[]
}): boolean {
  if (isSubmitting || isUploading) return false
  if (!reviewContentValid) {
    toast.error(
      `Review must be at least ${REVIEW_MIN_CHARACTERS} characters, ${REVIEW_MIN_WORDS} words, and ${REVIEW_MIN_SENTENCES} sentences.`,
    )
    return false
  }

  if (!markdown.trim()) {
    toast.error('Content is required.')
    return false
  }

  if (postType === 'review' && !validateReviewTopics(reviewTopics)) return false

  if (postType === 'data_point' && !isEdit && !dataPointVertical) {
    toast.error('Please select a data point category (credit card or bank account).')
    return false
  }

  return true
}

function validateReviewTopics(reviewTopics: ReviewTopicEntry[]): boolean {
  if (reviewTopics.length === 0) {
    toast.error('At least one topic is required for reviews.')
    return false
  }
  for (const t of reviewTopics) {
    if (!t.topicId) {
      toast.error('A topic is required for each review entry.')
      return false
    }
    if (t.rating === 0) {
      toast.error('A star rating is required for each review topic.')
      return false
    }
  }
  if (reviewTopics.length >= 2 && reviewTopics.every(t => t.rating === reviewTopics[0]!.rating)) {
    toast.error('Ratings must not all be the same when comparing multiple topics.')
    return false
  }
  const topicIds = reviewTopics.map(t => t.topicId)
  if (new Set(topicIds).size !== topicIds.length) {
    toast.error('Duplicate topics are not allowed.')
    return false
  }
  return true
}
