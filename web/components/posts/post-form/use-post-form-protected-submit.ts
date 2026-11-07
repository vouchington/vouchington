import { useRef, type RefObject, type SubmitEvent } from 'react'
import type { DataPointVertical, StructuredDataState } from '../data-point-fields'
import { useTurnstileToken } from '@/hooks/use-turnstile-token'
import { useRecaptchaToken } from '@/hooks/use-recaptcha-token'
import { getReviewMetrics } from './review-metrics'
import { validatePostForm } from './review-validation'
import { useDiscussionCategoryState } from './discussion-category-state'
import { usePostImageState } from './image-state'
import { useReviewTopicState } from './review-topic-state'
import { usePostFormSubmit } from './submit-handler'
import type { PostFormProps } from './types'
import type { Post, PostBroadcast, PostPrivacy } from '@/types/posts'

export function usePostFormProtectedSubmit({
  broadcast,
  contentLocked,
  dataPointVertical,
  discussions,
  effectiveCommunityId,
  effectiveCommunitySlug,
  effectivePendingRedirectPath,
  hpPhoneRef,
  hpWebsiteRef,
  imageState,
  initialRelatedUrls,
  initialSlugRef,
  isAdmin,
  isAnonymous,
  isEdit,
  language,
  markdown,
  onSubmitted,
  post,
  postType,
  privacy,
  push,
  reviews,
  saveToProfile,
  slugRef,
  structuredData,
  title,
  userFinancialProfile,
}: {
  broadcast: PostBroadcast
  contentLocked: boolean
  dataPointVertical: DataPointVertical | null
  discussions: ReturnType<typeof useDiscussionCategoryState>
  effectiveCommunityId?: string
  effectiveCommunitySlug?: string
  effectivePendingRedirectPath?: string
  hpPhoneRef: RefObject<HTMLInputElement | null>
  hpWebsiteRef: RefObject<HTMLInputElement | null>
  imageState: ReturnType<typeof usePostImageState>
  initialRelatedUrls: NonNullable<PostFormProps['initialRelatedUrls']>
  initialSlugRef: RefObject<string>
  isAdmin: boolean
  isAnonymous: boolean
  isEdit: boolean
  language: string | null
  markdown: string
  onSubmitted?: PostFormProps['onSubmitted']
  post?: Post
  postType: PostFormProps['postType']
  privacy: PostPrivacy
  push: (href: string) => void
  reviews: ReturnType<typeof useReviewTopicState>
  saveToProfile: boolean
  slugRef: RefObject<string>
  structuredData: StructuredDataState
  title: string
  userFinancialProfile: PostFormProps['userFinancialProfile']
}) {
  const turnstile = useTurnstileToken(
    effectiveCommunitySlug ? 'communities.create-post' : 'posts.create',
  )
  const recaptcha = useRecaptchaToken()
  const recaptchaTokenRef = useRef<string | undefined>(undefined)
  const isSubmittingRef = useRef(false)
  const submit = usePostFormSubmit({
    communityPendingRedirectPath: effectivePendingRedirectPath,
    communitySlug: effectiveCommunitySlug,
    isEdit,
    router: { push },
    onCaptchaConsumed: turnstile.reset,
    onSubmitted,
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
  const handleSubmit = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault()
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
  return { handleSubmit, reviewMetrics, submit, turnstile }
}
