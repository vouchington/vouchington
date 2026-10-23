import { USER_TAGS } from '@voucha/types/entities/user-tags'

type SeededTopic = {
  name: string
  slug: string
  options?: {
    aliases?: string[]
  }
}

export const SEEDED_TOPICS: ReadonlyArray<SeededTopic> = [
  ...USER_TAGS.map(tag => ({ name: tag.label, slug: tag.slug })),
  { name: 'Self-Promotion', slug: 'self-promotion' },
  { name: 'AI Generated', slug: 'ai-generated' },
  { name: 'Political', slug: 'political' },
  { name: 'Click Bait', slug: 'click-bait' },
  { name: 'Vague Post', slug: 'vague-post' },
  { name: 'Shit Post', slug: 'shit-post' },
  { name: 'Buying', slug: 'buying', options: { aliases: ['to buy'] } },
  { name: 'Selling', slug: 'selling', options: { aliases: ['for sale'] } },
  { name: 'Trade', slug: 'trade', options: { aliases: ['to trade', 'trading'] } },
  { name: 'For Hire', slug: 'for-hire' },
  { name: 'Hiring', slug: 'hiring' },
  { name: 'Voucha', slug: 'voucha' },
]
