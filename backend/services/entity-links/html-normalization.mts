import { parseCanonicalPostUrl } from './canonical-post-url.mts'

const BANG_AUTOLINK_RE =
  /!<a\b(?:[^>"']|"[^"]*"|'[^']*')*\shref="([^"]+)"(?:[^>"']|"[^"]*"|'[^']*')*>(.*?)<\/a>/g

export function normalizeBangAutolinks(text: string): string {
  return text.replace(BANG_AUTOLINK_RE, (match, href: string, linkText: string) => {
    if (linkText.trim() !== href || !isSameSiteCanonicalPostUrl(href)) {
      return match
    }
    return `!${href}`
  })
}

function isSameSiteCanonicalPostUrl(value: string): boolean {
  if (!/^[a-z][a-z\d+.-]*:/i.test(value)) return false
  return parseCanonicalPostUrl(value) !== null
}
