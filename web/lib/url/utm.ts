import { SITE_ORIGIN } from '@/lib/seo/constants'

export interface UtmParams {
  source: string
  medium: string
}

export const OUTBOUND_UTM: UtmParams = {
  source: 'voucha.ai',
  medium: 'referral',
}

export const SHARE_UTM: UtmParams = {
  source: 'voucha',
  medium: 'share',
}

const SITE_HOST = new URL(SITE_ORIGIN).host

export function isExternalHref(href: string): boolean {
  try {
    const parsed = new URL(href.startsWith('//') ? `https:${href}` : href)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false
    return parsed.host !== SITE_HOST
  } catch {
    return false
  }
}

export function isHttpHref(href: string): boolean {
  try {
    const parsed = new URL(href.startsWith('//') ? `https:${href}` : href)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

export function appendUtm(url: string, params: UtmParams): string {
  const normalized = url.startsWith('//') ? `https:${url}` : url
  let parsed: URL
  try {
    parsed = new URL(normalized)
  } catch {
    return url
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return url

  for (const key of parsed.searchParams.keys()) {
    if (key.startsWith('utm_')) return url
  }

  parsed.searchParams.set('utm_source', params.source)
  parsed.searchParams.set('utm_medium', params.medium)
  return parsed.toString()
}
