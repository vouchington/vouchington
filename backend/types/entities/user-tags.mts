export const USER_TAGS = [
  { slug: 'bot', label: 'Bot' },
  { slug: 'spammer', label: 'Spammer' },
] as const

export type UserTagSlug = (typeof USER_TAGS)[number]['slug']

export const USER_TAG_SLUGS = USER_TAGS.map(tag => tag.slug)
