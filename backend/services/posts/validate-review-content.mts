import assert from 'http-assert'
import { countWords, countSentences } from '@ts-shared/utils/text-metrics'
import {
  REVIEW_MIN_CHARACTERS,
  REVIEW_MIN_WORDS,
  REVIEW_MIN_SENTENCES,
} from '@ts-shared/utils/validation-core'

export function assertValidReviewContent(markdown: string): void {
  const charCount = markdown.length
  assert(
    charCount >= REVIEW_MIN_CHARACTERS,
    422,
    `Review must be at least ${REVIEW_MIN_CHARACTERS} characters (got ${charCount}).`,
  )

  const wordCount = countWords(markdown)
  assert(
    wordCount >= REVIEW_MIN_WORDS,
    422,
    `Review must be at least ${REVIEW_MIN_WORDS} words (got ${wordCount}).`,
  )

  const sentenceCount = countSentences(markdown)
  assert(
    sentenceCount >= REVIEW_MIN_SENTENCES,
    422,
    `Review must have at least ${REVIEW_MIN_SENTENCES} sentences (got ${sentenceCount}).`,
  )
}
