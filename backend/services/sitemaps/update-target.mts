import { SITEMAP_CONFIG } from '@voucha/config/sitemaps'
import { getUtcDayFromDate } from '@ts-shared/utils/dates'
import { isPostPotentiallySitemapEligible } from './eligibility.mts'
import type { SitemapPostType } from './types.mts'
import type { Post } from '@voucha/types/entities/post'

type SitemapProcessorPost = Pick<Post, 'post_type' | 'created_at'> &
  Partial<Pick<Post, 'broadcast' | 'privacy' | 'deleted_at' | 'approved_at'>> & {
    slug?: string | null
  }

export function getPostSitemapUpdateTarget(
  post: SitemapProcessorPost | null | undefined,
  options?: { wasPotentiallyEligible?: boolean },
): { postType: SitemapPostType; day: string } | null {
  if (!post || !isSupportedSitemapPostType(post.post_type)) return null

  if (!options?.wasPotentiallyEligible) {
    if (!hasEligibilityFields(post) || !isPostPotentiallySitemapEligible(post)) {
      return null
    }
  }

  return {
    postType: post.post_type,
    day: getUtcDayFromDate(post.created_at),
  }
}

function isSupportedSitemapPostType(postType: string): postType is SitemapPostType {
  const supportedTypes: readonly string[] = SITEMAP_CONFIG.POST_TYPES
  return supportedTypes.includes(postType)
}

function hasEligibilityFields(
  post: SitemapProcessorPost,
): post is SitemapProcessorPost &
  Pick<Post, 'broadcast' | 'privacy' | 'deleted_at' | 'approved_at'> {
  return !(
    post.broadcast === undefined ||
    post.privacy === undefined ||
    post.deleted_at === undefined ||
    post.approved_at === undefined
  )
}
