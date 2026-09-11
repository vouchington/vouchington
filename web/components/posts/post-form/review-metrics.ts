import { countSentences, countWords } from '@ts-shared/utils/text-metrics'
import {
  REVIEW_MIN_CHARACTERS,
  REVIEW_MIN_SENTENCES,
  REVIEW_MIN_WORDS,
} from '@ts-shared/utils/validation-core'
import type { PostType } from '@/types/posts'

export function getReviewMetrics({
  contentLocked,
  isAdmin,
  markdown,
  postType,
}: {
  contentLocked: boolean
  isAdmin: boolean
  markdown: string
  postType: PostType
}) {
  const charCount = markdown.length
  const wordCount = postType === 'review' ? countWords(markdown) : 0
  const sentenceCount = postType === 'review' ? countSentences(markdown) : 0
  const valid =
    postType !== 'review' ||
    contentLocked ||
    isAdmin ||
    (charCount >= REVIEW_MIN_CHARACTERS &&
      wordCount >= REVIEW_MIN_WORDS &&
      sentenceCount >= REVIEW_MIN_SENTENCES)

  return { charCount, sentenceCount, valid, wordCount }
}
