/** Composite score above this threshold → post is flagged as spam */
export const SPAM_SCORE_THRESHOLD = 0.6

/** Maximum number of external links before link count triggers flagging */
export const MAX_EXTERNAL_LINKS = 5

/** Link-to-text-word ratio above this threshold → flagged */
export const LINK_TO_TEXT_RATIO_THRESHOLD = 0.3

/** Cosine similarity above this threshold with another user's post → flagged */
export const EMBEDDINGS_SIMILARITY_THRESHOLD = 0.99

/**
 * Spam keyword patterns (case-insensitive).
 * Each entry is a regex-compatible string.
 */
export const SPAM_KEYWORD_PATTERNS: string[] = [
  // Crypto / airdrop scams
  'airdrop',
  'free tokens',
  'guaranteed returns',
  'guaranteed profit',
  'crypto giveaway',
  'send .{0,20} get .{0,20} back',
  // SEO spam
  'buy backlinks',
  'cheap seo',
  'increase your ranking',
  'da[0-9]+ backlink',
  // Pharma spam
  'buy viagra',
  'buy cialis',
  'cheap pills',
  'online pharmacy',
  // Generic spam
  'click here to claim',
  'limited time offer',
  'act now',
  'you have been selected',
  'congratulations you won',
]

/** Weights for each signal in the composite score calculation */
export const SIGNAL_WEIGHTS = {
  excessive_links: 0.2,
  spam_keywords: 0.3,
  content_hash_duplicate: 0.25,
  low_quality_text: 0.1,
  embeddings_similarity: 0.15,
  referral_link_in_post: 0.2,
} as const
