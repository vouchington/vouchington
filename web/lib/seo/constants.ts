import { buildAbsoluteUrl as absoluteUrl } from '@vouchington/utils/seo-metadata'

export const SITE_NAME = 'Voucha'
export const SITE_ORIGIN = 'https://voucha.ai'
export const SITE_DESCRIPTION =
  'Voucha is a social trust network — news, reviews, and recommendations from the people and sources you actually trust.'

export function buildAbsoluteUrl(path: string = '/'): string {
  return absoluteUrl(SITE_ORIGIN, path)
}
