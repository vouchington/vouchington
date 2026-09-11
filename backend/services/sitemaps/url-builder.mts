import { SITEMAP_CONFIG } from '@voucha/config/sitemaps'
import type { SitemapFamilyEntry, SitemapPost, SitemapPostType, SitemapUrl } from './types.mts'

const SITEMAP_POST_ROUTE_SEGMENTS: Record<SitemapPostType, string> = {
  article: 'article',
  blog_post: 'blog-post',
  data_point: 'data-point',
  discussion: 'discussion',
  link: 'link',
  review: 'review',
  story: 'story',
}

const getBaseUrl = (): string => SITEMAP_CONFIG.BASE_URL.replace(/\/$/, '')

export const buildPostUrl = (post: SitemapPost): string => {
  return `${getBaseUrl()}/${SITEMAP_POST_ROUTE_SEGMENTS[post.post_type]}/${post.slug}`
}

export const buildSitemapUrl = (path: string): string => {
  const cleanPath = path.startsWith('/') ? path.slice(1) : path
  return `${getBaseUrl()}/${cleanPath}`
}

export const buildPostSitemapUrl = (post: SitemapPost): SitemapUrl => {
  // Use max of post.updated_at and review.updated_at
  const postUpdated = new Date(post.updated_at)
  const reviewUpdated = post.review_updated_at ? new Date(post.review_updated_at) : null

  const lastmod = reviewUpdated && reviewUpdated > postUpdated ? reviewUpdated : postUpdated

  return {
    loc: buildPostUrl(post),
    lastmod: lastmod.toISOString(),
  }
}

export const buildFamilySitemapUrl = (entry: SitemapFamilyEntry): SitemapUrl => ({
  loc: buildSitemapUrl(entry.path),
  lastmod: new Date(entry.updated_at).toISOString(),
})
