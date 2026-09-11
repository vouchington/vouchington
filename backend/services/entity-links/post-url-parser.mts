import type { PostMention } from './types.mts'
import { parseCanonicalPostUrl } from './canonical-post-url.mts'

const URL_TERMINATORS = new Set([' ', '\n', '\r', '\t', '<', '>', '"', "'"])
const TRAILING_URL_PUNCTUATION = new Set(['.', ',', '!', '?', ';', ':', ')', ']', '}', '"', "'"])
const ABSOLUTE_URL_RE = /^[a-z][a-z\d+.-]*:/i

export function parsePostUrlToken(
  text: string,
  startIndex: number,
): { identifier: string; endIndex: number; source: PostMention['source'] } | null {
  const token = readUrlToken(text, startIndex)
  if (!token) return null

  const parsed = parseCanonicalPostUrl(asCanonicalUrlInput(token.value))
  if (!parsed) return null

  return { ...parsed, endIndex: token.endIndex }
}

function asCanonicalUrlInput(value: string): string {
  if (value.startsWith('/') || ABSOLUTE_URL_RE.test(value)) return value
  return `/${value}`
}

function readUrlToken(text: string, startIndex: number) {
  let endIndex = startIndex
  while (endIndex < text.length && !URL_TERMINATORS.has(text[endIndex]!)) {
    endIndex++
  }

  let value = text.slice(startIndex, endIndex)
  while (value.length > 0 && TRAILING_URL_PUNCTUATION.has(value.at(-1)!)) {
    value = value.slice(0, -1)
    endIndex--
  }

  if (!value) return null
  return { value, endIndex }
}
