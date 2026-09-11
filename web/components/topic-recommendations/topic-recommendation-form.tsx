'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import type { TopicRecommendationMutationInput } from '@/lib/api/client/topic-recommendations'
import onError from '@/lib/on-error'
import { TurnstileField } from '@/components/shared/turnstile-field'
import { useTurnstileToken } from '@/hooks/use-turnstile-token'
import { UsernameRequiredDialog } from '@/components/shared/username-required-dialog'
import { useTopicRecommendationDuplicates } from '@/hooks/use-topic-recommendation-duplicates'
import type { Post } from '@/types/posts'
import {
  buildTopicRecommendationMutationInput,
  getRecommendationFormDefaults,
} from './topic-recommendation-form-codecs'
import { TopicRecommendationFormFields } from './topic-recommendation-form-fields'
import { TopicRecommendationDuplicateCheck } from './topic-recommendation-duplicate-check'
import { submitTopicRecommendation } from './topic-recommendation-form-submit'
import { useTranslations } from '@/lib/i18n/use-translations'

const MIN_TITLE_LENGTH = 3

interface Props {
  recommendation?: Post
  initialType?: 'topic' | 'referral_program' | 'card'
}

export function TopicRecommendationForm({ recommendation, initialType }: Props) {
  const t = useTranslations()
  const { push, refresh } = useRouter()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [usernameDialogOpen, setUsernameDialogOpen] = useState(false)
  const [duplicateTitle, setDuplicateTitle] = useState('')
  const [duplicateSlug, setDuplicateSlug] = useState('')
  const pendingPayloadRef = useRef<TopicRecommendationMutationInput | null>(null)
  const turnstile = useTurnstileToken()

  const isEdit = !!recommendation
  const defaults = getRecommendationFormDefaults(recommendation)
  if (initialType && !recommendation) {
    defaults.topic_type = initialType
  }

  const {
    data: duplicateData,
    isLoading: duplicateLoading,
    isBlocked,
  } = useTopicRecommendationDuplicates({ topicTitle: duplicateTitle, topicSlug: duplicateSlug })

  async function handleSubmit(payload: TopicRecommendationMutationInput) {
    await submitTopicRecommendation(payload, {
      isEdit,
      recommendationId: recommendation?.id,
      turnstileToken: turnstile.token,
      onTurnstileReset: turnstile.reset,
      onIdentityRequired: () => setUsernameDialogOpen(true),
      onNavigate: () => {
        push('/topic-recommendations')
        refresh()
      },
      onSetSubmitting: setIsSubmitting,
    })
  }

  function onTitleSlugChange(title: string, slug: string) {
    if (isEdit) return
    setDuplicateTitle(title)
    setDuplicateSlug(slug)
  }

  async function onSubmit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    if (isSubmitting) return
    setIsSubmitting(true)

    const formData = new FormData(event.currentTarget)
    const title = String(formData.get('title') ?? '').trim()
    const markdown = String(formData.get('markdown') ?? '').trim()
    const topicTitle = String(formData.get('topic_title') ?? '').trim()
    const topicSlug = String(formData.get('topic_slug') ?? '').trim()

    if (!topicTitle || !topicSlug || !markdown) {
      onError(new Error('Validation failed'), {
        fallback: t(
          'extracted.topicRecommendations.topicRecommendationForm.topicTitleSlugAndRecommendationBody_4bcc3eb8',
        ),
        skipSentry: true,
      })
      setIsSubmitting(false)
      return
    }

    const topicHostname = String(formData.get('topic_hostname') ?? '').trim()
    const topicType = String(formData.get('topic_type') ?? 'topic').trim() as
      | 'topic'
      | 'referral_program'
      | 'card'
    const exampleReferralLink = String(formData.get('example_referral_link') ?? '').trim()
    const landingPageUrlsRaw = String(formData.get('landing_page_urls') ?? '').trim()

    if (topicType === 'referral_program' && !exampleReferralLink) {
      onError(new Error('Validation failed'), {
        fallback: t(
          'extracted.topicRecommendations.topicRecommendationForm.anExampleReferralLinkIsRequired_4b219499',
        ),
        skipSentry: true,
      })
      setIsSubmitting(false)
      return
    }

    if (topicType === 'card' && !landingPageUrlsRaw) {
      onError(new Error('Validation failed'), {
        fallback: t(
          'extracted.topicRecommendations.topicRecommendationForm.atLeastOneLandingPageUrl_6b275758',
        ),
        skipSentry: true,
      })
      setIsSubmitting(false)
      return
    }

    const payload = buildTopicRecommendationMutationInput({
      title,
      markdown,
      topic_title: topicTitle,
      topic_slug: topicSlug,
      topic_markdown: String(formData.get('topic_markdown') ?? '').trim(),
      topic_hostname: topicHostname,
      topic_hostnames: String(formData.get('topic_hostnames') ?? ''),
      topic_aliases: defaults.topic_aliases,
      topic_type: topicType,
      example_referral_link: exampleReferralLink,
      landing_page_urls: landingPageUrlsRaw,
    })

    pendingPayloadRef.current = payload
    await handleSubmit(payload)
  }

  const submitLabel = isSubmitting
    ? t('extracted.topicRecommendations.topicRecommendationForm.saving_dc85af8f')
    : isEdit
      ? t('extracted.topicRecommendations.topicRecommendationForm.saveRecommendation_30a622bf')
      : t('extracted.topicRecommendations.topicRecommendationForm.submitRecommendation_80e12df9')
  return (
    <form
      onSubmit={onSubmit}
      className='space-y-6'
    >
      <TopicRecommendationFormFields
        defaults={defaults}
        onTitleSlugChange={isEdit ? undefined : onTitleSlugChange}
      />

      {!isEdit && (
        <TopicRecommendationDuplicateCheck
          data={duplicateData}
          isLoading={duplicateLoading}
          isBelowMinLength={duplicateTitle.trim().length < MIN_TITLE_LENGTH}
        />
      )}

      {!isEdit && <TurnstileField turnstile={turnstile} />}

      <div className='flex gap-3'>
        <Button
          type='submit'
          loading={isSubmitting}
          disabled={isSubmitting || (!isEdit && !turnstile.token) || (!isEdit && isBlocked)}
          data-pw='topic-recommendation-form-submit'
        >
          {submitLabel}
        </Button>
        <Button
          type='button'
          variant='outline'
          onClick={() => push('/topic-recommendations')}
        >
          {t('extracted.topicRecommendations.topicRecommendationForm.cancel_19766ed6')}
        </Button>
      </div>

      <UsernameRequiredDialog
        open={usernameDialogOpen}
        onUsernameSet={() => {
          setUsernameDialogOpen(false)
          const payload = pendingPayloadRef.current
          if (payload) void handleSubmit(payload)
        }}
        onClose={() => {
          setUsernameDialogOpen(false)
          pendingPayloadRef.current = null
          setIsSubmitting(false)
        }}
      />
    </form>
  )
}
