import { SITEMAP_CONFIG } from '@voucha/config/sitemaps'
import type { SitemapFamilyType, SitemapPostType } from '@services/sitemaps/types'

export function requireJobPostType(value: unknown): SitemapPostType {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error('postType is required')
  }

  if (SITEMAP_CONFIG.POST_TYPES.includes(value as SitemapPostType)) {
    return value as SitemapPostType
  }

  throw new Error(`Unsupported postType: ${value}`)
}

export function requireJobFamily(value: unknown): SitemapFamilyType {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error('family is required')
  }

  if (SITEMAP_CONFIG.FAMILY_TYPES.includes(value as SitemapFamilyType)) {
    return value as SitemapFamilyType
  }

  throw new Error(`Unsupported family: ${value}`)
}

export function requireJobString(value: unknown, fieldName: string): string {
  if (typeof value === 'string' && value.length > 0) {
    return value
  }

  throw new Error(`${fieldName} is required`)
}
