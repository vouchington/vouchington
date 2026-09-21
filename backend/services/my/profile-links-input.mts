import assert from 'http-assert'
import { isHttpUrlWithoutFragment } from '@modules/utils'

export type ProfileLinkType =
  | 'url'
  | 'twitter'
  | 'facebook'
  | 'instagram'
  | 'github'
  | 'linkedin'
  | 'youtube'
  | 'tiktok'

export type CreateProfileLinkInput = {
  link_type: ProfileLinkType
  url?: string | null
  handle?: string | null
  name?: string | null
  image_id?: string | null
}

export type UpdateProfileLinkInput = Omit<CreateProfileLinkInput, 'link_type'>

const validLinkTypes: ProfileLinkType[] = [
  'url',
  'twitter',
  'facebook',
  'instagram',
  'github',
  'linkedin',
  'youtube',
  'tiktok',
]
const validHandlePattern = /^[a-zA-Z0-9_-]+$/

export function assertProfileLinkType(linkType: ProfileLinkType): void {
  assert(validLinkTypes.includes(linkType), 400, 'Invalid link_type')
}

export function validateProfileLinkFields(
  linkType: ProfileLinkType,
  url: string | null | undefined,
  handle: string | null | undefined,
): void {
  if (linkType === 'url') {
    assert(typeof url === 'string' && url.length > 0, 400, 'url is required for link_type url')
    validateProfileUrl(url)
  } else if (handle != null && handle !== '') {
    assert(
      validHandlePattern.test(handle),
      400,
      'handle must only contain letters, numbers, underscores, and hyphens',
    )
  }
}

export function validateProfileUrl(url: string): void {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    assert(false, 400, 'url must be a valid URL')
  }
  assert(
    parsed.protocol === 'http:' || parsed.protocol === 'https:',
    400,
    'url must use http or https',
  )
  assert(parsed.hash === '', 400, 'url must be a valid URL without a fragment')
  assert(isHttpUrlWithoutFragment(url), 400, 'url must be a valid URL')
}
