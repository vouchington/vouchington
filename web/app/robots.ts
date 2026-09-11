import type { MetadataRoute } from 'next'
import { ROBOTS_DISALLOW_PREFIXES } from '@ts-shared/route-classification'

export default function robots(): MetadataRoute.Robots {
  if (process.env.NEXT_PUBLIC_NOINDEX === 'true') {
    return {
      rules: { userAgent: '*', disallow: '/' },
    }
  }
  // Use `||` rather than `??` so empty-string env values fall through to the
  // default base URL — `??` would emit a relative `/sitemap.xml`.
  const baseUrl =
    process.env.SITEMAP_BASE_URL || process.env.NEXT_PUBLIC_API_BASE_URL || 'https://voucha.ai'
  return {
    rules: { userAgent: '*', allow: '/', disallow: [...ROBOTS_DISALLOW_PREFIXES] },
    sitemap: `${baseUrl}/sitemap.xml`,
  }
}
