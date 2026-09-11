'use client'

import {
  REVIEW_MIN_CHARACTERS,
  REVIEW_MIN_WORDS,
  REVIEW_MIN_SENTENCES,
} from '@ts-shared/utils/validation-core'
import { useTranslations } from '@/lib/i18n/use-translations'

interface Props {
  charCount: number
  wordCount: number
  sentenceCount: number
}

export function ReviewContentCounter({
  charCount,
  wordCount,
  sentenceCount,
  'data-pw': dataPw = 'review-content-counter',
}: Props & { 'data-pw'?: string }) {
  const t = useTranslations()
  const charOk = charCount >= REVIEW_MIN_CHARACTERS
  const wordOk = wordCount >= REVIEW_MIN_WORDS
  const sentenceOk = sentenceCount >= REVIEW_MIN_SENTENCES

  return (
    <p
      className='mt-1 text-xs text-muted-foreground'
      data-pw={dataPw}
    >
      <span className={charOk ? '' : 'font-medium text-destructive'}>
        {charCount} {t('extracted.posts.reviewContentCounter.chars_1ce93dac')}
      </span>
      {' · '}
      <span className={wordOk ? '' : 'font-medium text-destructive'}>
        {wordCount} {wordCount === 1 ? 'word' : 'words'}
      </span>
      {' · '}
      <span className={sentenceOk ? '' : 'font-medium text-destructive'}>
        {sentenceCount} {sentenceCount === 1 ? 'sentence' : 'sentences'}
      </span>{' '}
      <span>
        {t(
          'extracted.posts.reviewContentCounter.minMincharsCharsMinwordsWordsMinsentences_4fcb238e',
          {
            minChars: REVIEW_MIN_CHARACTERS,
            minWords: REVIEW_MIN_WORDS,
            minSentences: REVIEW_MIN_SENTENCES,
          },
        )}
      </span>
    </p>
  )
}
