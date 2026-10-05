import { SITEMAP_CONFIG } from '@voucha/config/sitemaps'
import type { Post } from '@voucha/types/entities/post'
import type { SitemapPostType } from './types.mts'

type SitemapEligibilityPost = Pick<
  Post,
  'post_type' | 'broadcast' | 'privacy' | 'deleted_at' | 'approved_at'
> & {
  slug?: string | null
}

type SupportedSitemapPost = SitemapEligibilityPost & {
  post_type: SitemapPostType
}

/**
 * @public Documented contract; production use is unconfirmed and this export may be
 * removed after intended-use review. Evidence: `docs/overview/architecture/services/sitemaps/README.md`.
 */
export function isPostPotentiallySitemapEligible(
  post: SitemapEligibilityPost,
): post is SupportedSitemapPost {
  return (
    (SITEMAP_CONFIG.POST_TYPES as readonly string[]).includes(post.post_type) &&
    !post.deleted_at &&
    post.broadcast === 'everyone' &&
    post.privacy === 'public' &&
    Boolean(post.approved_at) &&
    Boolean(post.slug)
  )
}
