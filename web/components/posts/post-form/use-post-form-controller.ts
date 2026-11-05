import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { DataPointVertical } from '../data-point-fields'
import { useDiscussionCategoryState } from './discussion-category-state'
import { usePostImageState } from './image-state'
import { getAudienceDefaults, getInitialStructuredData } from './initial-state'
import { useMarkdownPreview } from './markdown-preview'
import { useReviewTopicState } from './review-topic-state'
import { useTextareaAutoResize } from './textarea-auto-resize'
import { communityPendingPostsHref } from '@/lib/links/entity-href'
import type { PostFormProps } from './types'
import { usePostFormProtectedSubmit } from './use-post-form-protected-submit'

const emptyRelatedUrls: NonNullable<PostFormProps['initialRelatedUrls']> = []
const emptyCommunityOptions: NonNullable<PostFormProps['communityOptions']> = []

export function usePostFormController({
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
  onSubmitted,
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
  const [language, setLanguage] = useState<string | null>(post?.declared_language ?? null)
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
  const protectedSubmit = usePostFormProtectedSubmit({
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
  })
  const handleSlugChange = (value: string) => {
    slugRef.current = value
  }
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
  return {
    ...protectedSubmit,
    audience,
    broadcast,
    communityOptions,
    communitySlug,
    contentLocked,
    dataPointVertical,
    discussions,
    handleBack: back,
    handleSelectedCommunityChange,
    handleSlugChange,
    hpPhoneRef,
    hpWebsiteRef,
    imageState,
    initialRelatedUrls,
    isAdvancedOpen,
    isAnonymous,
    isEdit,
    language,
    markdown,
    post,
    postType,
    preview,
    privacy,
    reviews,
    saveToProfile,
    selectedCommunitySlug,
    setBroadcast,
    setDataPointVertical,
    setIsAdvancedOpen,
    setIsAnonymous,
    setLanguage,
    setMarkdown,
    setPrivacy,
    setSaveToProfile,
    setStructuredData,
    setTitle,
    structuredData,
    textareaRef,
    title,
    userFinancialProfile,
  }
}
