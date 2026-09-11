'use client'

import { SimilarityPanels } from '@/components/admin/similarity/similarity-panels'
import type { TopicRecommendationDialogProps } from './topic-recommendation-dialog-types'
import { TopicRecommendationField } from './dialog-fields/topic-recommendation-field'
import { TopicRecommendationTypeSelect } from './topic-recommendation-type-select'
import { useTranslations } from '@/lib/i18n/use-translations'

type FieldsProps = Pick<
  TopicRecommendationDialogProps,
  'editableState' | 'isAdmin' | 'selected' | 'setEditableState'
>

export function TopicRecommendationDialogFields(props: FieldsProps) {
  const t = useTranslations()
  if (!props.editableState || !props.selected) return null

  const { editableState, isAdmin, setEditableState } = props

  const similarityQuery = [
    editableState.topic_title,
    editableState.topic_slug,
    editableState.topic_markdown,
  ]
    .filter(Boolean)
    .join('\n')

  const topicTitleLabel = t(
    'extracted.topicRecommendations.topicRecommendationDialogFields.topicTitle_0adc1126',
  )
  const fieldConfigsBefore = [
    ['modal-topic-title', topicTitleLabel, 'topic_title', topicTitleLabel, 'input'],
    [
      'modal-topic-slug',
      t('extracted.topicRecommendations.topicRecommendationDialogFields.topicSlug_b68f2edf'),
      'topic_slug',
      'topic-slug',
      'input',
    ],
    [
      'modal-topic-markdown',
      t('extracted.topicRecommendations.topicRecommendationDialogFields.topicMarkdown_3714a37d'),
      'topic_markdown',
      t(
        'extracted.topicRecommendations.topicRecommendationDialogFields.topicDescriptionMarkdown_96c0b3be',
      ),
      'textarea',
    ],
  ] as const

  const fieldConfigsAfter = [
    [
      'modal-topic-hostname',
      t('extracted.topicRecommendations.topicRecommendationDialogFields.primaryHostname_25c53669'),
      'topic_hostname',
      'example.com',
      'input',
    ],
    [
      'modal-topic-hostnames',
      t('extracted.topicRecommendations.topicRecommendationDialogFields.relatedHostnames_07582415'),
      'topic_hostnames',
      'example.com\nexample.org',
      'textarea',
    ],
  ] as const

  return (
    <div className='space-y-4'>
      <TopicRecommendationTypeSelect
        topicType={editableState.topic_type}
        isAdmin={isAdmin}
        onChange={value => {
          setEditableState(current => (current ? { ...current, topic_type: value } : current))
        }}
      />

      {fieldConfigsBefore.map(([id, label, key, placeholder, kind]) => (
        <TopicRecommendationField
          key={id}
          disabled={!isAdmin}
          editableState={editableState}
          fieldKey={key}
          id={id}
          kind={kind}
          label={label}
          placeholder={placeholder}
          setEditableState={setEditableState}
        />
      ))}

      {isAdmin ? (
        <SimilarityPanels
          query={similarityQuery}
          layout='stacked'
          excludePostId={props.selected.id}
        />
      ) : null}

      {fieldConfigsAfter.map(([id, label, key, placeholder, kind]) => (
        <TopicRecommendationField
          key={id}
          disabled={!isAdmin}
          editableState={editableState}
          fieldKey={key}
          id={id}
          kind={kind}
          label={label}
          placeholder={placeholder}
          setEditableState={setEditableState}
        />
      ))}

      {editableState.topic_type === 'referral_program' ? (
        <TopicRecommendationField
          disabled={!isAdmin}
          editableState={editableState}
          fieldKey='example_referral_link'
          id='modal-example-referral-link'
          kind='input'
          label={t(
            'extracted.topicRecommendations.topicRecommendationDialogFields.exampleReferralLink_b187988d',
          )}
          placeholder={t(
            'extracted.topicRecommendations.topicRecommendationDialogFields.httpsExampleComReferralRefYourcode_472c82b6',
          )}
          setEditableState={setEditableState}
        />
      ) : null}

      {editableState.topic_type === 'card' ? (
        <TopicRecommendationField
          disabled={!isAdmin}
          editableState={editableState}
          fieldKey='landing_page_urls'
          id='modal-landing-page-urls'
          kind='textarea'
          label={t(
            'extracted.topicRecommendations.topicRecommendationDialogFields.landingPageUrls_e0bfd837',
          )}
          placeholder={t(
            'extracted.topicRecommendations.topicRecommendationDialogFields.httpsBankComCardXHttps_de209aeb',
          )}
          setEditableState={setEditableState}
        />
      ) : null}

      {props.selected.topic_recommendation?.approval_error_message ? (
        <div className='rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive'>
          {props.selected.topic_recommendation.approval_error_message}
        </div>
      ) : null}
      {isAdmin ? (
        <TopicRecommendationField
          editableState={editableState}
          fieldKey='rejection_reason'
          id='modal-rejection-reason'
          kind='textarea'
          label={t(
            'extracted.topicRecommendations.topicRecommendationDialogFields.rejectionReason_e5749926',
          )}
          placeholder={t(
            'extracted.topicRecommendations.topicRecommendationDialogFields.reasonForRejection_80701edf',
          )}
          setEditableState={setEditableState}
        />
      ) : null}
    </div>
  )
}
