import { createHashtagNormalizer, type NormalizedHashtag } from '@vouchington/utils/hashtags'

export type { NormalizedHashtag }

const hashtagNormalizer = createHashtagNormalizer({
  maximumAuthoredLength: 255,
  maximumKeyLength: 255,
  separators: ['.', '_'],
})

/**
 * Normalizes a hashtag search fragment without requiring it to be a complete
 * hashtag. This keeps mobile-friendly `.` and `_` input aligned with the
 * canonical hyphenated alias lookup.
 */
export function normalizeHashtagQuery(input: string): string {
  return hashtagNormalizer.normalizeQuery(input)
}

/**
 * Returns the canonical key for a user-authored hashtag. The authored token is
 * retained for occurrence storage while the key is suitable for lookup.
 */
export function normalizeHashtag(input: string): NormalizedHashtag | null {
  return hashtagNormalizer.normalize(input)
}
