export const SELF_PROMOTION_MODERATOR_SLUG = 'self-promotion'
export const MARKETPLACE_MODERATOR_SLUG = 'marketplace'
export const AI_GENERATED_MODERATOR_SLUG = 'ai-generated'
export const POLITICS_AVERSE_MODERATOR_SLUG = 'politics-averse'
export const CLICK_BAIT_MODERATOR_SLUG = 'click-bait'
export const VAGUE_POST_MODERATOR_SLUG = 'vague-post'
export const SHIT_POST_MODERATOR_SLUG = 'shit-post'

export const MARKETPLACE_CATEGORIES = ['buying', 'selling', 'trade', 'for-hire', 'hiring'] as const

const TOPIC_SLUG_BY_MODERATOR_SLUG: Readonly<Record<string, string>> = {
  [SELF_PROMOTION_MODERATOR_SLUG]: SELF_PROMOTION_MODERATOR_SLUG,
  [AI_GENERATED_MODERATOR_SLUG]: AI_GENERATED_MODERATOR_SLUG,
  [CLICK_BAIT_MODERATOR_SLUG]: CLICK_BAIT_MODERATOR_SLUG,
  [VAGUE_POST_MODERATOR_SLUG]: VAGUE_POST_MODERATOR_SLUG,
  [SHIT_POST_MODERATOR_SLUG]: SHIT_POST_MODERATOR_SLUG,
  [POLITICS_AVERSE_MODERATOR_SLUG]: 'political',
}

export function getTopicSlugsForModerator(
  moderatorSlug: string,
  categories: string[] | undefined,
): string[] {
  const topicSlug = TOPIC_SLUG_BY_MODERATOR_SLUG[moderatorSlug]
  if (topicSlug) return [topicSlug]
  if (moderatorSlug === MARKETPLACE_MODERATOR_SLUG) return parseMarketplaceCategories(categories)
  return []
}

function parseMarketplaceCategories(categories: string[] | undefined): string[] {
  if (!categories) return []
  const validCategories = new Set<string>(MARKETPLACE_CATEGORIES)
  return categories.flatMap(c => {
    const normalized = c.trim().toLowerCase()
    return validCategories.has(normalized) ? [normalized] : []
  })
}
