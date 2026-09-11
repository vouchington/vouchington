import { toast } from 'sonner'
import { createCommunityPost, createPost, setPostImages, updatePost } from '@/lib/api/client/posts'
import { createEntityRelation } from '@/lib/api/client/entity-relations'
import { ApiError } from '@/lib/api/error'
import type { PostMutationResponseBody } from '@/types/api-responses'
import type { Post, PostBroadcast, PostPrivacy, PostType } from '@/types/posts'
import type { StructuredDataState, DataPointVertical } from '../data-point-fields'
import type { ReviewTopicEntry } from '../post-form-sections'
import type { ImageEntry } from '../post-form-images-fieldset'
import { updateProfileFromStructuredData } from './profile-sync'
import { syncReviewRatings } from './rating-sync'
import { getPostStructuredData } from './structured-data'
import type { RelatedUrl } from './types'
import type { FinancialProfile } from '@/types/my'

export interface SubmitPostInput {
  broadcast: PostBroadcast
  /** Cloudflare Turnstile token; required by the backend when creating (not editing) a post. */
  cfTurnstileResponse?: string
  /** reCAPTCHA Enterprise v3 token (action `create_post`); optional, fail-soft. */
  recaptchaToken?: string
  communityId?: string
  communitySlug?: string
  contentLocked: boolean
  dataPointVertical: DataPointVertical | null
  discussionCategories: Array<{ topicId: string; hashtag: string }>
  discussionCategoriesChanged?: boolean
  hpPhone: string
  hpWebsite: string
  images: ImageEntry[]
  initialRelatedUrls: RelatedUrl[]
  isAnonymous: boolean
  isEdit: boolean
  language: string | null
  markdown: string
  post?: Post
  postType: PostType
  privacy: PostPrivacy
  reviewTopics: ReviewTopicEntry[]
  saveToProfile: boolean
  slug?: string
  structuredData: StructuredDataState
  title: string
  userFinancialProfile?: FinancialProfile | null
}

export class PostSavedWithRatingError extends Error {
  constructor(
    readonly saved: Post,
    readonly cause: unknown,
  ) {
    super('Post saved, but some rating changes may not have saved.')
  }
}

export interface SubmitPostResult {
  post: Post
  communityPostReview?: PostMutationResponseBody['community_post_review']
}

export async function submitPost(input: SubmitPostInput): Promise<SubmitPostResult> {
  const uploadedImages = input.images.map(({ key: _key, ...img }) => ({
    ...img,
    caption: img.caption.trim(),
  }))
  const result = input.isEdit
    ? await updateExistingPost(input, uploadedImages)
    : await createNewPost(input, uploadedImages)

  if (input.postType === 'data_point' && input.saveToProfile) {
    await updateProfileFromStructuredData(input.structuredData, input.userFinancialProfile)
  }

  return result
}

async function updateExistingPost(
  input: SubmitPostInput,
  uploadedImages: Array<Omit<ImageEntry, 'key'>>,
): Promise<SubmitPostResult> {
  const post = input.post!
  const categories = serializeDiscussionCategories(input.discussionCategories)
  const { post: saved } = await updatePost(post.id, {
    ...(input.contentLocked ? {} : { title: input.title, markdown: input.markdown }),
    ...(input.postType !== 'comment' && { broadcast: input.broadcast, privacy: input.privacy }),
    ...(input.slug !== undefined && input.slug.trim() !== '' && { slug: input.slug.trim() }),
    is_anonymous: input.isAnonymous,
    ...(input.postType === 'discussion' &&
      !input.contentLocked &&
      (input.discussionCategoriesChanged ?? true) && { categories }),
    ...(input.postType === 'data_point' &&
      !input.contentLocked &&
      input.dataPointVertical && {
        data_point_vertical: input.dataPointVertical,
        structured_data: getPostStructuredData(input),
      }),
  })

  if (input.postType === 'review') {
    try {
      await syncReviewRatings(saved, post, input.reviewTopics)
    } catch (error) {
      throw new PostSavedWithRatingError(saved, error)
    }
  }
  await syncImages(saved, post, uploadedImages).catch(error => {
    toast.error(
      error instanceof ApiError
        ? `Post saved, but images failed: ${error.message}`
        : 'Post saved, but images could not be updated. Please try again.',
    )
  })
  return { post: saved }
}

async function createNewPost(
  input: SubmitPostInput,
  uploadedImages: Array<Omit<ImageEntry, 'key'>>,
): Promise<SubmitPostResult> {
  const categories = serializeDiscussionCategories(input.discussionCategories)
  const createInput = {
    post_type: input.postType,
    title: input.title,
    markdown: input.markdown,
    ...(input.slug !== undefined && input.slug.trim() !== '' && { slug: input.slug.trim() }),
    ...(input.postType === 'review' && {
      review_topic_ratings: input.reviewTopics.map(t => ({
        topic_id: t.topicId,
        rating: t.rating,
      })),
    }),
    ...(input.postType === 'discussion' && { categories }),
    ...(input.postType !== 'comment' && { broadcast: input.broadcast, privacy: input.privacy }),
    is_anonymous: input.isAnonymous,
    ...(uploadedImages.length > 0 && { images: uploadedImages }),
    ...(input.postType === 'data_point' &&
      input.dataPointVertical && {
        data_point_vertical: input.dataPointVertical,
        structured_data: getPostStructuredData(input),
      }),
    hp_website: input.hpWebsite,
    hp_phone: input.hpPhone,
    cf_turnstile_response: input.cfTurnstileResponse,
    recaptcha_token: input.recaptchaToken,
    declared_language: input.language,
  }
  let response
  if (input.communitySlug) {
    if (!input.communityId) throw new Error('Community posts require a community ID')
    response = await createCommunityPost(input.communitySlug, {
      ...createInput,
      community_id: input.communityId,
    })
  } else {
    response = await createPost(createInput)
  }
  const { post: saved } = response
  await linkRelatedUrls(saved, input.initialRelatedUrls)
  return { post: saved, communityPostReview: response.community_post_review }
}

export function serializeDiscussionCategories(
  categories: SubmitPostInput['discussionCategories'],
): Array<{ type: 'topic'; topic_id: string } | { type: 'hashtag'; hashtag: string }> {
  const serialized: Array<
    { type: 'topic'; topic_id: string } | { type: 'hashtag'; hashtag: string }
  > = []
  for (const category of categories) {
    if (category.topicId) {
      serialized.push({ type: 'topic', topic_id: category.topicId })
      continue
    }
    const hashtag = category.hashtag.trim()
    if (hashtag) serialized.push({ type: 'hashtag', hashtag })
  }
  return serialized
}

async function syncImages(
  saved: Post,
  post: Post,
  uploadedImages: Array<Omit<ImageEntry, 'key'>>,
): Promise<void> {
  const originalImages = post.images ?? []
  const originalById = new Map(originalImages.map(img => [img.image_id, img]))
  const imagesChanged =
    uploadedImages.length !== originalImages.length ||
    uploadedImages.some(img => {
      const orig = originalById.get(img.image_id)
      return !orig || img.order_index !== orig.order_index || img.caption !== orig.caption
    })
  if (imagesChanged) await setPostImages(saved.id, uploadedImages)
}

async function linkRelatedUrls(saved: Post, relatedUrls: RelatedUrl[]): Promise<void> {
  if (relatedUrls.length === 0) return
  await Promise.allSettled(
    relatedUrls.map(u => createEntityRelation('post', saved.id, 'related', 'url', u.id)),
  )
}
