import { createSlugFromTitle, convertUUIDToBase36, isSlug } from '@modules/utils'
import assert from 'http-assert'

const MAX_SLUG_LENGTH = 80
// Leave 15 chars for the '-<base36-suffix>' (1 hyphen + up to 14 base36 digits from 72 random bits)
const MAX_NAME_SLUG_LENGTH = 65

export function validateCommunitySlug(slug: string): string {
  assert(isSlug(slug), 422, 'Slug must only contain lowercase letters, numbers, and hyphens')
  assert(slug.length <= MAX_SLUG_LENGTH, 422, `Slug must be at most ${MAX_SLUG_LENGTH} characters`)
  return slug
}

export function generateCommunitySlug(name: string, id: string): string {
  const nameSlug = createSlugFromTitle(name, MAX_NAME_SLUG_LENGTH)
    .slice(0, MAX_NAME_SLUG_LENGTH)
    .replace(/-+$/, '')
  assert(nameSlug.length > 0, 422, 'Could not generate a valid slug from the given name')
  return `${nameSlug}-${convertUUIDToBase36(id)}`
}
