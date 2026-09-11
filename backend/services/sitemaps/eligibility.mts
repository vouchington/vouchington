import { SITEMAP_CONFIG } from '@voucha/config/sitemaps'
import type { Post } from '@voucha/types/entities/post'
import type { SitemapPostType } from './types.mts'

type SitemapEligibilityPost = Pick<
  Post,
  'post_type' | 'broadcast' | 'privacy' | 'deleted_at' | 'openai_omni_moderation_flagged'
> & {
  slug?: string | null
}

type SupportedSitemapPost = SitemapEligibilityPost & {
  post_type: SitemapPostType
}

export function isPostPotentiallySitemapEligible(
  post: SitemapEligibilityPost,
): post is SupportedSitemapPost {
  return (
    (SITEMAP_CONFIG.POST_TYPES as readonly string[]).includes(post.post_type) &&
    !post.deleted_at &&
    post.broadcast === 'everyone' &&
    post.privacy === 'public' &&
    !post.openai_omni_moderation_flagged &&
    Boolean(post.slug)
  )
}
