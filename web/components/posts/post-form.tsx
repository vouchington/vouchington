/* oxlint-disable max-lines -- large post-compose orchestrator already at the ceiling; required Turnstile bot-protection wiring pushes it just over */
'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { DataPointVertical } from './data-point-fields'
import { ImagesFieldset } from './post-form-images-fieldset'
import { AdvancedOptions } from './post-form/advanced-options'
import { CommunitySelect } from './post-form/community-select'
import { ContentEditor } from './post-form/content-editor'
import { useDiscussionCategoryState } from './post-form/discussion-category-state'
import { FormActions } from './post-form/form-actions'
import { HoneypotFields } from './post-form/honeypot-fields'
import { usePostImageState } from './post-form/image-state'
import { getAudienceDefaults, getInitialStructuredData } from './post-form/initial-state'
import { useMarkdownPreview } from './post-form/markdown-preview'
import { RelatedUrls } from './post-form/related-urls'
import { getReviewMetrics } from './post-form/review-metrics'
import { validatePostForm } from './post-form/review-validation'
import { useReviewTopicState } from './post-form/review-topic-state'
import { usePostFormSubmit } from './post-form/submit-handler'
import { useTextareaAutoResize } from './post-form/textarea-auto-resize'
import { TitleField } from './post-form/title-field'
import { PostTypeFields } from './post-form/post-type-fields'
import { PostSlugField } from './post-form/post-slug-field'
import { UsernameRetryDialog } from './post-form/username-retry-dialog'
import { TurnstileField } from '@/components/shared/turnstile-field'
import { useTurnstileToken } from '@/hooks/use-turnstile-token'
import { useRecaptchaToken } from '@/hooks/use-recaptcha-token'
import { communityPendingPostsHref } from '@/lib/links/entity-href'
import type { PostFormProps } from './post-form/types'

const emptyRelatedUrls: NonNullable<PostFormProps['initialRelatedUrls']> = []
const emptyCommunityOptions: NonNullable<PostFormProps['communityOptions']> = []
export function PostForm({
  postType,
  post,
  initialRelatedUrls = emptyRelatedUrls,
  userFinancialProfile,
  isAdmin = false,
  initialReviewTopic,
  initialDataPointTopic,
  initialDiscussionCategories,
  communityId,
  communitySlug,
  communityVisibility,
  communityPendingRedirectPath,
  initialCommunitySlug,
  communityOptions = emptyCommunityOptions,
}: PostFormProps) {
  const { back, push } = useRouter()
  const isEdit = post !== undefined
  const contentLocked = isEdit && post.can_edit_content === false
  const [selectedCommunitySlug, setSelectedCommunitySlug] = useState(
    communitySlug ?? initialCommunitySlug ?? '',
  )
  const selectedCommunity = communityOptions.find(
    community => community.slug === selectedCommunitySlug,
  )
  const effectiveCommunitySlug = communitySlug ?? selectedCommunity?.slug
  const effectiveCommunityId = communityId ?? selectedCommunity?.id
  const effectiveCommunityVisibility = communityVisibility ?? selectedCommunity?.visibility
  const effectivePendingRedirectPath =
    communityPendingRedirectPath ??
    (selectedCommunity?.post_approval_required_at
      ? communityPendingPostsHref(selectedCommunity)
      : undefined)
  const audience = getAudienceDefaults({
    post,
    communitySlug: effectiveCommunitySlug,
    communityVisibility: effectiveCommunityVisibility,
  })
  const [title, setTitle] = useState(post?.title ?? '')
  const [markdown, setMarkdown] = useState(post?.markdown ?? '')
  const [dataPointVertical, setDataPointVertical] = useState<DataPointVertical | null>(
    (post?.data_point_vertical as DataPointVertical) ?? initialDataPointTopic?.vertical ?? null,
  )
  const [structuredData, setStructuredData] = useState(() =>
    getInitialStructuredData({ post, initialDataPointTopic }),
  )
  const [broadcast, setBroadcast] = useState(audience.initialBroadcast)
  const [privacy, setPrivacy] = useState(audience.initialPrivacy)
  const [isAnonymous, setIsAnonymous] = useState(post?.is_anonymous ?? false)
  const [language, setLanguage] = useState<string | null>(null)
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false)
  const [saveToProfile, setSaveToProfile] = useState(false)
  const slugRef = useRef(post?.slug ?? '')
  const initialSlugRef = useRef(post?.slug ?? '')
  const hpWebsiteRef = useRef<HTMLInputElement>(null)
  const hpPhoneRef = useRef<HTMLInputElement>(null)
  const textareaRef = useTextareaAutoResize(markdown)
  const preview = useMarkdownPreview(markdown)
  const reviews = useReviewTopicState({ post, initialReviewTopic })
  const discussions = useDiscussionCategoryState(initialDiscussionCategories)
  const imageState = usePostImageState(post)
  const turnstile = useTurnstileToken()
  const recaptcha = useRecaptchaToken()
  const recaptchaTokenRef = useRef<string | undefined>(undefined)
  const isSubmittingRef = useRef(false)
  const submit = usePostFormSubmit({
    communityPendingRedirectPath: effectivePendingRedirectPath,
    communitySlug: effectiveCommunitySlug,
    isEdit,
    router: { push },
    onCaptchaConsumed: turnstile.reset,
    submitInput: () => ({
      broadcast,
      cfTurnstileResponse: turnstile.token ?? undefined,
      recaptchaToken: recaptchaTokenRef.current,
      communityId: effectiveCommunityId,
      communitySlug: effectiveCommunitySlug,
      contentLocked,
      dataPointVertical,
      discussionCategories: discussions.discussionCategories,
      discussionCategoriesChanged: discussions.discussionCategoriesChanged,
      hpPhone: hpPhoneRef.current?.value ?? '',
      hpWebsite: hpWebsiteRef.current?.value ?? '',
      images: imageState.images,
      initialRelatedUrls,
      isAnonymous,
      isEdit,
      language,
      markdown,
      post,
      postType,
      privacy,
      reviewTopics: reviews.reviewTopics,
      saveToProfile,
      ...(slugRef.current !== initialSlugRef.current && { slug: slugRef.current }),
      structuredData,
      title,
      userFinancialProfile,
    }),
  })

  const reviewMetrics = getReviewMetrics({ contentLocked, isAdmin, markdown, postType })
  const handleSelectedCommunityChange = (nextSlug: string) => {
    setSelectedCommunitySlug(nextSlug)
    const nextCommunity = communityOptions.find(community => community.slug === nextSlug)
    const nextAudience = getAudienceDefaults({
      communitySlug: nextCommunity?.slug,
      communityVisibility: nextCommunity?.visibility,
    })
    setBroadcast(nextAudience.initialBroadcast)
    setPrivacy(nextAudience.initialPrivacy)
  }
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const valid = validatePostForm({
      dataPointVertical,
      isEdit,
      isSubmitting: submit.isSubmitting,
      isUploading: imageState.isUploading,
      markdown,
      postType,
      reviewContentValid: reviewMetrics.valid,
      reviewTopics: reviews.reviewTopics,
    })
    if (!valid || isSubmittingRef.current) return
    isSubmittingRef.current = true
    try {
      if (!isEdit) {
        recaptchaTokenRef.current = (await recaptcha.execute('create_post')) ?? undefined
      }
      await submit.handleSubmitPost()
    } finally {
      isSubmittingRef.current = false
    }
  }
  return (
    <>
      <form
        onSubmit={handleSubmit}
        className='space-y-4'
        data-pw='post-form'
      >
        <TitleField
          contentLocked={contentLocked}
          setTitle={setTitle}
          title={title}
        />
        <PostSlugField
          initialSlug={post?.slug ?? ''}
          onSlugChange={v => (slugRef.current = v)}
        />
        {!isEdit && !communitySlug && (
          <CommunitySelect
            communities={communityOptions}
            value={selectedCommunitySlug}
            onValueChange={handleSelectedCommunityChange}
          />
        )}
        <PostTypeFields
          contentLocked={contentLocked}
          dataPointVertical={dataPointVertical}
          discussions={discussions}
          postType={postType}
          reviews={reviews}
          saveToProfile={saveToProfile}
          setDataPointVertical={setDataPointVertical}
          setSaveToProfile={setSaveToProfile}
          setStructuredData={setStructuredData}
          structuredData={structuredData}
          userFinancialProfile={userFinancialProfile}
        />
        <RelatedUrls urls={initialRelatedUrls} />
        <ImagesFieldset
          images={imageState.images}
          onImageUploaded={imageState.handleImageUploaded}
          setIsUploading={imageState.setIsUploading}
          moveImage={imageState.moveImage}
          updateCaption={imageState.updateCaption}
          removeImage={imageState.removeImage}
        />
        <ContentEditor
          activeTab={preview.activeTab}
          contentLocked={contentLocked}
          markdown={markdown}
          postType={postType}
          previewHtml={preview.previewHtml}
          previewLoading={preview.previewLoading}
          reviewCharCount={reviewMetrics.charCount}
          reviewSentenceCount={reviewMetrics.sentenceCount}
          reviewWordCount={reviewMetrics.wordCount}
          setActiveTab={preview.setActiveTab}
          setMarkdown={setMarkdown}
          textareaRef={textareaRef}
        />
        {postType !== 'comment' && (
          <AdvancedOptions
            broadcast={broadcast}
            isAdvancedOpen={isAdvancedOpen}
            isAnonymous={isAnonymous}
            language={language}
            isCommunityPost={audience.isCommunityPost}
            isPrivateCommunityPost={audience.isPrivateCommunityPost}
            post={post}
            privacy={privacy}
            setBroadcast={setBroadcast}
            setIsAdvancedOpen={setIsAdvancedOpen}
            setIsAnonymous={setIsAnonymous}
            setLanguage={setLanguage}
            setPrivacy={setPrivacy}
          />
        )}
        <HoneypotFields
          hpPhoneRef={hpPhoneRef}
          hpWebsiteRef={hpWebsiteRef}
        />
        {!isEdit && <TurnstileField turnstile={turnstile} />}
        <FormActions
          isEdit={isEdit}
          isSubmitting={submit.isSubmitting}
          onCancel={back}
          disabled={
            submit.isSubmitting ||
            imageState.isUploading ||
            !reviewMetrics.valid ||
            (!isEdit && !turnstile.token)
          }
        />
      </form>
      <UsernameRetryDialog
        open={submit.usernameDialogOpen}
        onUsernameSet={submit.handleUsernameSet}
        onClose={submit.handleUsernameClose}
      />
    </>
  )
}
