'use client'

import type { Dispatch, SetStateAction } from 'react'
import {
  DataPointFields,
  type DataPointVertical,
  type StructuredDataState,
} from '../data-point-fields'
import { DiscussionFields, type DiscussionCategoryEntry } from '../discussion-fields'
import { ReviewTopicsFieldset, type ReviewTopicEntry } from '../post-form-sections'
import type { FinancialProfile } from '@/types/my'
import type { PostType } from '@/types/posts'

export function PostTypeFields({
  contentLocked,
  dataPointVertical,
  discussions,
  postType,
  reviews,
  saveToProfile,
  setDataPointVertical,
  setSaveToProfile,
  setStructuredData,
  structuredData,
  userFinancialProfile,
}: {
  contentLocked: boolean
  dataPointVertical: DataPointVertical | null
  discussions: DiscussionFieldsState
  postType: PostType
  reviews: ReviewFieldsState
  saveToProfile: boolean
  setDataPointVertical: (vertical: DataPointVertical | null) => void
  setSaveToProfile: (save: boolean) => void
  setStructuredData: Dispatch<SetStateAction<StructuredDataState>>
  structuredData: StructuredDataState
  userFinancialProfile?: FinancialProfile | null
}) {
  return (
    <>
      {postType === 'data_point' && (
        <DataPointFields
          vertical={dataPointVertical}
          onVerticalChange={setDataPointVertical}
          structuredData={structuredData}
          onStructuredDataChange={setStructuredData}
          userFinancialProfile={userFinancialProfile}
          saveToProfile={saveToProfile}
          onSaveToProfileChange={setSaveToProfile}
          disabled={contentLocked}
        />
      )}
      {postType === 'review' && (
        <ReviewTopicsFieldset
          reviewTopics={reviews.reviewTopics}
          setTopicInputRef={reviews.setTopicInputRef}
          moveReviewTopic={reviews.moveReviewTopic}
          onReviewTopicChange={reviews.handleReviewTopicChange}
          onReviewRatingChange={reviews.handleReviewRatingChange}
          removeReviewTopic={reviews.removeReviewTopic}
          addReviewTopic={reviews.addReviewTopic}
        />
      )}
      {postType === 'discussion' && (
        <DiscussionFields
          categories={discussions.discussionCategories}
          disabled={contentLocked}
          onCategoryChange={discussions.handleDiscussionCategoryChange}
          onHashtagChange={discussions.handleDiscussionHashtagChange}
          onAddCategory={() => discussions.addDiscussionCategory()}
          onRemoveCategory={index => discussions.removeDiscussionCategory(index)}
          onMoveCategory={(index, direction) =>
            discussions.moveDiscussionCategory(index, direction)
          }
          pendingFocusIndexRef={discussions.pendingCategoryFocusIndexRef}
        />
      )}
    </>
  )
}

interface DiscussionFieldsState {
  addDiscussionCategory: () => void
  discussionCategories: DiscussionCategoryEntry[]
  handleDiscussionCategoryChange: (index: number, id: string, name: string) => void
  handleDiscussionHashtagChange: (index: number, hashtag: string) => void
  moveDiscussionCategory: (index: number, direction: -1 | 1) => void
  pendingCategoryFocusIndexRef: React.RefObject<number | null>
  removeDiscussionCategory: (index: number) => void
}

interface ReviewFieldsState {
  addReviewTopic: () => void
  handleReviewRatingChange: (index: number, rating: number) => void
  handleReviewTopicChange: (index: number, id: string, name: string) => void
  moveReviewTopic: (index: number, direction: -1 | 1) => void
  removeReviewTopic: (index: number) => void
  reviewTopics: ReviewTopicEntry[]
  setTopicInputRef: (index: number, element: HTMLInputElement | null) => void
}
