import { createProfilePageJsonLd } from '@vouchington/utils/json-ld'
import { buildAbsoluteUrl } from './constants'

interface ProfilePageOptions {
  username: string
  displayName?: string | null
  path: string
  identifier: string
  imagePath?: string | null
  dateCreated?: string
  sameAs?: string[]
}

export function createProfilePageSchema(options: ProfilePageOptions): Record<string, unknown> {
  return createProfilePageJsonLd({ absoluteUrl: buildAbsoluteUrl }, options)
}
