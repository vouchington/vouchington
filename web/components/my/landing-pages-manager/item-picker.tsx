'use client'

import { Button } from '@/components/ui/button'
import { CandidatePagination } from './candidate-pagination'
import type { LandingPageItem } from '@/types/landing-pages'
import type { LandingPageAddType, LandingPageItemOptions } from './options'
import { emptyCandidateMessage, isAddItemDisabled } from './item-picker-validation'
import { DraftItemsList } from './draft-items-list'
import { CandidateSelect, TopicGroupOptions, TopicSelect } from './item-picker-fields'
import { AddTypeSelect, LinkFields } from './item-picker-add-type'
import { useTranslations } from '@/lib/i18n/use-translations'

interface ItemPickerProps {
  loading: boolean
  itemLimit: number
  hasNextPage: boolean
  loadingCandidates: boolean
  candidatesError: boolean
  onLoadMore: () => void
  addType: LandingPageAddType
  selectedCandidateId: string
  selectedTopicId: string
  selectedGroupReviewIds: string[]
  selectedGroupReferralIds: string[]
  options: LandingPageItemOptions
  linkLabel: string
  linkUrl: string
  onAddTypeChange: (value: LandingPageAddType) => void
  setSelectedCandidateId: (value: string) => void
  setSelectedTopicId: (value: string) => void
  setSelectedGroupReviewIds: React.Dispatch<React.SetStateAction<string[]>>
  setSelectedGroupReferralIds: React.Dispatch<React.SetStateAction<string[]>>
  setLinkLabel: (value: string) => void
  setLinkUrl: (value: string) => void
  onAddItem: () => void
  onSaveItems: () => void
  draftItems: LandingPageItem[]
  moveItem: (index: number, direction: -1 | 1) => void
  removeItem: (index: number) => void
  moveGroupEntry: (itemIndex: number, entryIndex: number, direction: -1 | 1) => void
  removeGroupEntry: (itemIndex: number, entryIndex: number) => void
}

export function LandingPageItemEditor({
  loading,
  itemLimit,
  hasNextPage,
  loadingCandidates,
  candidatesError,
  onLoadMore,
  addType,
  selectedCandidateId,
  selectedTopicId,
  selectedGroupReviewIds,
  selectedGroupReferralIds,
  options,
  linkLabel,
  linkUrl,
  onAddTypeChange,
  setSelectedCandidateId,
  setSelectedTopicId,
  setSelectedGroupReviewIds,
  setSelectedGroupReferralIds,
  setLinkLabel,
  setLinkUrl,
  onAddItem,
  onSaveItems,
  draftItems,
  moveItem,
  removeItem,
  moveGroupEntry,
  removeGroupEntry,
}: ItemPickerProps) {
  const t = useTranslations()
  const itemCount = draftItems.reduce(
    (count, item) => count + 1 + (item.type === 'topic_group' ? item.entries.length : 0),
    0,
  )
  const addedCount =
    addType === 'topic_group'
      ? 1 + selectedGroupReviewIds.length + selectedGroupReferralIds.length
      : 1
  const exceedsLimit = itemCount + addedCount > itemLimit
  const addDisabled =
    loading ||
    exceedsLimit ||
    isAddItemDisabled(
      addType,
      selectedCandidateId,
      selectedTopicId,
      linkLabel,
      linkUrl,
      options,
      selectedGroupReviewIds,
      selectedGroupReferralIds,
    )
  const emptyMessage = hasNextPage ? null : emptyCandidateMessage(addType, options)

  return (
    <div className='space-y-4 rounded-lg border p-4'>
      <div className='flex items-center justify-between gap-3'>
        <h2 className='text-lg font-semibold'>
          {t('extracted.landingPagesManager.itemPicker.pageContent_c661980d')}
        </h2>
        <Button
          type='button'
          onClick={onSaveItems}
          disabled={loading}
          data-pw='landing-page-save-content'
        >
          {t('extracted.landingPagesManager.itemPicker.saveContent_ff8a3f71')}
        </Button>
      </div>
      <div className='space-y-3 rounded-md border p-4'>
        <div className='grid gap-3 md:grid-cols-2'>
          <AddTypeSelect
            addType={addType}
            onAddTypeChange={onAddTypeChange}
          />
          {addType === 'link' ? (
            <LinkFields
              linkLabel={linkLabel}
              linkUrl={linkUrl}
              setLinkLabel={setLinkLabel}
              setLinkUrl={setLinkUrl}
            />
          ) : addType !== 'topic_group' ? (
            <CandidateSelect
              addType={addType}
              selectedCandidateId={selectedCandidateId}
              setSelectedCandidateId={setSelectedCandidateId}
              options={options}
            />
          ) : (
            <TopicSelect
              selectedTopicId={selectedTopicId}
              setSelectedTopicId={setSelectedTopicId}
              topicOptions={options.topicOptions}
            />
          )}
        </div>
        {addType === 'topic_group' && selectedTopicId ? (
          <TopicGroupOptions
            options={options}
            selectedGroupReviewIds={selectedGroupReviewIds}
            selectedGroupReferralIds={selectedGroupReferralIds}
            setSelectedGroupReviewIds={setSelectedGroupReviewIds}
            setSelectedGroupReferralIds={setSelectedGroupReferralIds}
          />
        ) : null}
        {hasNextPage && addType !== 'link' ? (
          <CandidatePagination
            loading={loadingCandidates}
            error={candidatesError}
            onLoadMore={onLoadMore}
          />
        ) : null}
        {exceedsLimit ? (
          <output className='block text-xs text-muted-foreground'>
            {t('extracted.landingPagesManager.itemPicker.itemLimitReached', { limit: itemLimit })}
          </output>
        ) : null}
        {emptyMessage ? (
          <p
            className='text-xs text-muted-foreground'
            data-pw='landing-page-add-item-empty-hint'
          >
            {emptyMessage}
          </p>
        ) : null}
        <Button
          type='button'
          variant='outline'
          onClick={onAddItem}
          disabled={addDisabled}
          data-pw='landing-page-add-item-button'
        >
          {t('extracted.landingPagesManager.itemPicker.addItem_d1a0b329')}
        </Button>
      </div>
      <DraftItemsList
        draftItems={draftItems}
        moveItem={moveItem}
        removeItem={removeItem}
        moveGroupEntry={moveGroupEntry}
        removeGroupEntry={removeGroupEntry}
      />
    </div>
  )
}
