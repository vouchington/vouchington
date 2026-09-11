'use client'

import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { LandingReviewTitle } from './landing-review-title'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { LandingPageAddType, LandingPageItemOptions } from './options'
import { useTranslations } from '@/lib/i18n/use-translations'

export function CandidateSelect({
  addType,
  selectedCandidateId,
  setSelectedCandidateId,
  options,
}: {
  addType: LandingPageAddType
  selectedCandidateId: string
  setSelectedCandidateId: (value: string) => void
  options: LandingPageItemOptions
}) {
  const t = useTranslations()
  const selectOptions =
    addType === 'profile_link'
      ? options.availableProfileLinks.map(link => ({
          id: link.id,
          label:
            link.name ||
            link.handle ||
            link.url ||
            t('extracted.landingPagesManager.itemPickerFields.profileLink_bdb5518e'),
        }))
      : addType === 'review'
        ? options.availableReviews.map(review => ({ id: review.id, review }))
        : options.availableReferralLinks.map(referralLink => ({
            id: referralLink.id,
            label: referralLink.label || referralLink.referral_program_name,
          }))
  return (
    <div className='space-y-1'>
      <Label htmlFor='candidate-id'>
        {t('extracted.landingPagesManager.itemPickerFields.item_652bcc3a')}
      </Label>
      <Select
        value={selectedCandidateId || undefined}
        onValueChange={setSelectedCandidateId}
      >
        <SelectTrigger
          id='candidate-id'
          data-pw='landing-page-candidate-select'
        >
          <SelectValue
            placeholder={t('extracted.landingPagesManager.itemPickerFields.selectItem_2d94cc67')}
          />
        </SelectTrigger>
        <SelectContent>
          {selectOptions.map(option => (
            <SelectItem
              key={option.id}
              value={option.id}
            >
              {'review' in option ? <LandingReviewTitle review={option.review} /> : option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

export function TopicSelect({
  selectedTopicId,
  setSelectedTopicId,
  topicOptions,
}: {
  selectedTopicId: string
  setSelectedTopicId: (value: string) => void
  topicOptions: LandingPageItemOptions['topicOptions']
}) {
  const t = useTranslations()
  return (
    <div className='space-y-1'>
      <Label htmlFor='group-topic-id'>
        {t('extracted.landingPagesManager.itemPickerFields.topic_7e61847d')}
      </Label>
      <Select
        value={selectedTopicId || undefined}
        onValueChange={setSelectedTopicId}
      >
        <SelectTrigger id='group-topic-id'>
          <SelectValue
            placeholder={t('extracted.landingPagesManager.itemPickerFields.selectTopic_07373f46')}
          />
        </SelectTrigger>
        <SelectContent>
          {topicOptions.map(topic => (
            <SelectItem
              key={topic.id}
              value={topic.id}
            >
              {topic.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

export function TopicGroupOptions({
  options,
  selectedGroupReviewIds,
  selectedGroupReferralIds,
  setSelectedGroupReviewIds,
  setSelectedGroupReferralIds,
}: {
  options: LandingPageItemOptions
  selectedGroupReviewIds: string[]
  selectedGroupReferralIds: string[]
  setSelectedGroupReviewIds: React.Dispatch<React.SetStateAction<string[]>>
  setSelectedGroupReferralIds: React.Dispatch<React.SetStateAction<string[]>>
}) {
  const t = useTranslations()
  return (
    <div className='grid gap-4 md:grid-cols-2'>
      <div className='space-y-2'>
        <p className='text-sm font-medium'>
          {t('extracted.landingPagesManager.itemPickerFields.reviews_84cb7871')}
        </p>
        {options.availableGroupReviews.map(review => (
          <div
            key={review.id}
            className='flex items-center gap-2 text-sm'
          >
            <Checkbox
              id={`group-review-${review.id}`}
              checked={selectedGroupReviewIds.includes(review.id)}
              onCheckedChange={(checked: boolean | 'indeterminate') =>
                setSelectedGroupReviewIds(prev =>
                  checked === true ? [...prev, review.id] : prev.filter(id => id !== review.id),
                )
              }
            />
            <Label
              htmlFor={`group-review-${review.id}`}
              className='font-normal'
            >
              <LandingReviewTitle review={review} />
            </Label>
          </div>
        ))}
      </div>
      <div className='space-y-2'>
        <p className='text-sm font-medium'>
          {t('extracted.landingPagesManager.itemPickerFields.referralLinks_fcbca63d')}
        </p>
        {options.availableGroupReferralLinks.map(referralLink => (
          <div
            key={referralLink.id}
            className='flex items-center gap-2 text-sm'
          >
            <Checkbox
              id={`group-referral-${referralLink.id}`}
              checked={selectedGroupReferralIds.includes(referralLink.id)}
              onCheckedChange={(checked: boolean | 'indeterminate') =>
                setSelectedGroupReferralIds(prev =>
                  checked === true
                    ? [...prev, referralLink.id]
                    : prev.filter(id => id !== referralLink.id),
                )
              }
            />
            <Label
              htmlFor={`group-referral-${referralLink.id}`}
              className='font-normal'
            >
              {referralLink.label || referralLink.referral_program_name}
            </Label>
          </div>
        ))}
      </div>
    </div>
  )
}
