import assert from 'http-assert'
import * as slugifyModule from 'slugify'
import { isUUID } from './ids.mts'
import { isSlug } from '@ts-shared/utils/slugs'
import { USERNAME_MIN_LENGTH, USERNAME_MAX_LENGTH } from '@ts-shared/utils/validation-core'

export { isSlug }

const slugify = (slugifyModule.default ?? slugifyModule) as unknown as (
  text: string,
  options?: Record<string, unknown> | string,
) => string

export const createSlugFromTitle = (title: string, maxLength = 50) => {
  let slug = slugify(title, {
    lower: true,
    strict: true,
    locale: 'en',
    trim: true,
  })

  if (slug.length > maxLength && slug.includes('-')) {
    const lastIndex = slug.slice(0, maxLength).lastIndexOf('-')
    slug = slug.slice(0, lastIndex)
  }

  return slug
}

export const validateSlug = (slug: string): string => {
  assert(
    isSlug(slug),
    422,
    `Slug must only contain lowercase letters, numbers, and hyphens: ${slug}`,
  )
  return slug
}

export const isUsername = (username: string): boolean =>
  !!username &&
  /^[a-z][a-z0-9_-]*[a-z0-9]$/i.test(username) && // start with letter, end alphanumeric; only letters/digits/_/-
  (username.match(/[a-z]/gi)?.length ?? 0) >= 3 && // at least 3 letters
  !isUUID(username) // not a UUID

export const isUsernameOrSlug = (string: string): boolean => isUsername(string) || isSlug(string)

export const validateUsername = (username = '') => {
  assert(
    username.length >= USERNAME_MIN_LENGTH,
    422,
    `Username must be at least ${USERNAME_MIN_LENGTH} characters`,
  )
  assert(
    username.length <= USERNAME_MAX_LENGTH,
    422,
    `Username must be at most ${USERNAME_MAX_LENGTH} characters`,
  )
  assert(
    /^[a-z][a-z0-9_-]+[a-z0-9]$/i.test(username),
    422,
    'Username must only contain letters, numbers, underscores, and hyphens',
  )
  assert(
    (username.match(/[a-z]/gi)?.length ?? 0) >= 3,
    422,
    'Username must contain at least 3 letters',
  )
  assert(!isUUID(username), 422, 'Username cannot be a UUID')
  return username.toString()
}
