/**
 * Re-exports all product intents from category-specific modules.
 * New intent definitions go in the appropriate sub-module, not here.
 */
import type { NavIntent } from './types'
import { PRODUCT_MEDIA_INTENTS } from './product-media'
import { POSTS_INTENT } from './product-posts'
import { PRODUCT_OTHER_INTENTS } from './product-other'
import { PRODUCT_COMMUNICATION_INTENTS } from './product-communication'
import { FEDIVERSE_INTENT } from './product-fediverse'
import { COMMUNITIES_INTENT, FRIENDS_INTENT } from './product-social'
import { LISTS_INTENT } from './product-lists'
import { SETTINGS_INTENT } from './product-settings'

export const PRODUCT_INTENTS: readonly NavIntent[] = [
  ...PRODUCT_MEDIA_INTENTS,
  POSTS_INTENT,
  ...PRODUCT_OTHER_INTENTS,
  FEDIVERSE_INTENT,
  ...PRODUCT_COMMUNICATION_INTENTS,
  COMMUNITIES_INTENT,
  FRIENDS_INTENT,
  LISTS_INTENT,
  SETTINGS_INTENT,
]
