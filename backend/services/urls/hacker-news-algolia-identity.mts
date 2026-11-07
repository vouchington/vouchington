import { Parser } from 'htmlparser2'
import { canonicalizeUrl } from '@vouchington/utils/urls'

export function hasHackerNewsLink(html: string, targetIdentity: string): boolean {
  let found = false
  const parser = new Parser({
    onopentag(name, attributes) {
      if (name === 'a' && hackerNewsUrlIdentity(attributes.href) === targetIdentity) found = true
    },
  })
  parser.end(html)
  return found
}

export function hackerNewsUrlIdentity(value: unknown): string | null {
  return typeof value === 'string' ? (canonicalizeUrl(value)?.identity ?? null) : null
}
