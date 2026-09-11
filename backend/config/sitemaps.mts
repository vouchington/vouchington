import { SITEMAP_FAMILY_TYPES, SITEMAP_POST_TYPES } from './sitemap-types.mts'

export const SITEMAP_CONFIG = {
  MAX_URLS_PER_SITEMAP: 50_000,
  POST_TYPES: SITEMAP_POST_TYPES,
  FAMILY_TYPES: SITEMAP_FAMILY_TYPES,
  // Base URL from environment or default (function to allow test overrides)
  get BASE_URL() {
    return process.env.SITEMAP_BASE_URL || 'https://voucha.ai'
  },
} as const
