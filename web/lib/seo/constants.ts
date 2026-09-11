export const SITE_NAME = 'Voucha'
export const SITE_ORIGIN = 'https://voucha.ai'
export const SITE_DESCRIPTION =
  'Voucha is a social trust network — news, reviews, and recommendations from the people and sources you actually trust.'

export function buildAbsoluteUrl(path: string = '/'): string {
  return new URL(path, SITE_ORIGIN).toString()
}

export function getMetadataBase(): URL {
  return new URL(SITE_ORIGIN)
}
