type ModeratorConfig = {
  slug: string
  baseline: boolean
}

/**
 * The seven fixed moderator identities seeded into `agents` / `agents__moderators`. Their question
 * text lives in the C5 post classifier catalog (`post-classifier.mts`); nothing here is a prompt.
 */
export const MODERATOR_CONFIGS: ModeratorConfig[] = [
  { slug: 'self-promotion', baseline: false },
  { slug: 'marketplace', baseline: false },
  { slug: 'ai-generated', baseline: true },
  { slug: 'politics-averse', baseline: false },
  { slug: 'click-bait', baseline: false },
  { slug: 'vague-post', baseline: false },
  { slug: 'shit-post', baseline: false },
]

export function isBaselineModeratorSlug(slug: string): boolean {
  return MODERATOR_CONFIGS.some(c => c.slug === slug && c.baseline)
}
