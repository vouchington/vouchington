'use client'

import { Button } from '@/components/ui/button'
import { ChevronDown, ChevronUp, Plus, Trash2 } from 'lucide-react'
import { StarRating } from './star-rating'
import { TopicAutocomplete } from './topic-autocomplete'
import { useTranslations } from '@/lib/i18n/use-translations'

export interface ReviewTopicEntry {
  key: string
  topicId: string
  topicName: string
  rating: number
}

export function ReviewTopicsFieldset({
  reviewTopics,
  setTopicInputRef,
  moveReviewTopic,
  onReviewTopicChange,
  onReviewRatingChange,
  removeReviewTopic,
  addReviewTopic,
}: {
  reviewTopics: ReviewTopicEntry[]
  setTopicInputRef: (index: number, element: HTMLInputElement | null) => void
  moveReviewTopic: (index: number, direction: -1 | 1) => void
  onReviewTopicChange: (index: number, id: string, name: string) => void
  onReviewRatingChange: (index: number, rating: number) => void
  removeReviewTopic: (index: number) => void
  addReviewTopic: () => void
}) {
  const t = useTranslations()
  return (
    <fieldset className='space-y-3'>
      <legend
        className='text-sm font-medium leading-none'
        data-pw='review-topics-ratings-legend'
      >
        {t('extracted.posts.postFormSections.topicsRatings_1c2001fe')}
      </legend>
      {reviewTopics.map((entry, index) => (
        <div
          key={entry.key}
          className='flex items-center gap-2 rounded-md border p-4'
        >
          <div className='flex flex-col gap-0.5'>
            <Button
              type='button'
              variant='ghost'
              size='sm'
              onClick={() => moveReviewTopic(index, -1)}
              disabled={index === 0}
              aria-label={t('extracted.posts.postFormSections.moveTopicUp_ddcd93d4')}
              className='min-h-11 min-w-11 p-0'
            >
              <ChevronUp className='h-3 w-3' />
            </Button>
            <Button
              type='button'
              variant='ghost'
              size='sm'
              onClick={() => moveReviewTopic(index, 1)}
              disabled={index === reviewTopics.length - 1}
              aria-label={t('extracted.posts.postFormSections.moveTopicDown_5c4f73b5')}
              className='min-h-11 min-w-11 p-0'
            >
              <ChevronDown className='h-3 w-3' />
            </Button>
          </div>
          <div className='flex min-w-0 flex-1 flex-col gap-2'>
            <TopicAutocomplete
              value={entry.topicId || null}
              label={entry.topicName}
              onChange={(id, name) => onReviewTopicChange(index, id, name)}
              excludeIds={reviewTopics.flatMap((t, i) =>
                i !== index && t.topicId ? [t.topicId] : [],
              )}
              inputRef={el => {
                setTopicInputRef(index, el)
              }}
            />
            <StarRating
              rating={entry.rating}
              onChange={r => onReviewRatingChange(index, r)}
              label={
                entry.topicName ||
                t('extracted.posts.postFormSections.topicIndex_f447ddc0', { index: index + 1 })
              }
            />
          </div>
          {reviewTopics.length > 1 && (
            <Button
              type='button'
              variant='ghost'
              size='sm'
              onClick={() => removeReviewTopic(index)}
              aria-label={t('extracted.posts.postFormSections.removeTopic_c3527616')}
            >
              <Trash2 className='h-4 w-4' />
            </Button>
          )}
        </div>
      ))}
      <Button
        type='button'
        variant='outline'
        size='sm'
        onClick={addReviewTopic}
        data-pw='review-add-topic-button'
      >
        <Plus className='mr-1 h-4 w-4' />
        {t('extracted.posts.postFormSections.addTopic_fdb299e7')}
      </Button>
    </fieldset>
  )
}
