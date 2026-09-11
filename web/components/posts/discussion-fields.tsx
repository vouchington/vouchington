/* eslint-disable react-you-might-not-need-an-effect/no-event-handler */
'use client'

import { useEffect, useMemo, useRef, type RefObject } from 'react'
import { ChevronDown, ChevronUp, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { TopicAutocomplete } from './topic-autocomplete'
import { useTranslations } from '@/lib/i18n/use-translations'

export interface DiscussionCategoryEntry {
  key: string
  topicId: string
  topicName: string
  hashtag: string
}

interface Props {
  categories: DiscussionCategoryEntry[]
  disabled?: boolean
  onCategoryChange: (index: number, id: string, name: string) => void
  onHashtagChange: (index: number, hashtag: string) => void
  onAddCategory: () => void
  onRemoveCategory: (index: number) => void
  onMoveCategory: (index: number, direction: -1 | 1) => void
  pendingFocusIndexRef: RefObject<number | null>
}

export function DiscussionFields({
  categories,
  disabled = false,
  onCategoryChange,
  onHashtagChange,
  onAddCategory,
  onRemoveCategory,
  onMoveCategory,
  pendingFocusIndexRef,
}: Props) {
  const t = useTranslations()
  const inputRefsRef = useRef<Array<HTMLInputElement | null>>([])
  const inputRefCallbacks = useMemo(
    () =>
      categories.map((_, index) => (el: HTMLInputElement | null) => {
        inputRefsRef.current[index] = el
      }),
    [categories, inputRefsRef],
  )

  useEffect(() => {
    if (pendingFocusIndexRef.current === null) return
    const idx = pendingFocusIndexRef.current
    pendingFocusIndexRef.current = null
    inputRefsRef.current[idx]?.focus()
  }, [categories.length, pendingFocusIndexRef])

  return (
    <fieldset className='space-y-2'>
      <legend className='text-sm font-medium leading-none'>
        {t('extracted.posts.discussionFields.categories_b8b1d894')}
      </legend>
      {categories.map((entry, index) => (
        <div
          key={entry.key}
          className='flex items-center gap-2 rounded-md border p-2'
        >
          <div className='flex flex-col gap-0.5'>
            <Button
              type='button'
              variant='ghost'
              size='sm'
              onClick={() => onMoveCategory(index, -1)}
              disabled={disabled || index === 0}
              aria-label={t('extracted.posts.discussionFields.moveCategoryUp_c27515b1')}
              className='relative size-6 p-0 after:absolute after:-top-[19px] after:-bottom-px after:-inset-x-[10px] after:content-[""]'
            >
              <ChevronUp className='h-4 w-4' />
            </Button>
            <Button
              type='button'
              variant='ghost'
              size='sm'
              onClick={() => onMoveCategory(index, 1)}
              disabled={disabled || index === categories.length - 1}
              aria-label={t('extracted.posts.discussionFields.moveCategoryDown_fb2a48bf')}
              className='relative size-6 p-0 after:absolute after:-bottom-[19px] after:-top-px after:-inset-x-[10px] after:content-[""]'
            >
              <ChevronDown className='h-4 w-4' />
            </Button>
          </div>

          <div className='flex min-w-0 flex-1 flex-col gap-2'>
            <TopicAutocomplete
              value={entry.topicId || null}
              label={entry.topicName}
              onChange={(id, name) => onCategoryChange(index, id, name)}
              excludeIds={categories.flatMap((c, i) =>
                i !== index && c.topicId ? [c.topicId] : [],
              )}
              placeholder={t('extracted.posts.discussionFields.searchTopics_c9b252c2')}
              inputRef={inputRefCallbacks[index]}
              disabled={disabled}
            />
            <Input
              value={entry.hashtag}
              onChange={event => onHashtagChange(index, event.target.value)}
              placeholder={t('extracted.topicRecommendations.topHashtags.orAddHashtag_d386ae55')}
              aria-label={t('extracted.topicRecommendations.topHashtags.orAddHashtag_d386ae55')}
              data-pw='discussion-hashtag-category'
              disabled={disabled}
            />
          </div>

          <Button
            type='button'
            variant='ghost'
            size='sm'
            onClick={() => onRemoveCategory(index)}
            aria-label={t('extracted.posts.discussionFields.removeCategory_464c77a1')}
            className='relative size-7 p-0 after:absolute after:-inset-2 after:content-[""]'
            disabled={disabled}
          >
            <Trash2 className='h-4 w-4' />
          </Button>
        </div>
      ))}
      <Button
        type='button'
        variant='outline'
        size='sm'
        onClick={onAddCategory}
        disabled={disabled}
      >
        <Plus className='mr-1 h-4 w-4' />
        {t('extracted.posts.discussionFields.addCategory_0fcd154e')}
      </Button>
    </fieldset>
  )
}
