import { isSlug, isUsername, isUUID } from '@modules/utils'
import { parsePostUrlToken } from './post-url-parser.mts'
import type { EntityMention, PostMention } from './types.mts'
import { hasValidRightBoundary } from './parser-boundaries.mts'

const TOPIC_IDENTIFIER_RE = /^[a-z0-9-]+$/i
const USER_IDENTIFIER_RE = /^[a-z0-9_-]+$/i
const POST_IDENTIFIER_RE = /^[a-z0-9-]+$/i

export function parsePrefixedMention(
  text: string,
  startIndex: number,
  prefix: string,
): EntityMention | null {
  if (prefix === '@') return parseUserMention(text, startIndex)
  if (prefix === '#') return parseTopicMention(text, startIndex)
  return parsePostMention(text, startIndex)
}

function parseUserMention(text: string, startIndex: number): EntityMention | null {
  const candidate = readWhile(text, startIndex + 1, char => USER_IDENTIFIER_RE.test(char))
  if (!candidate || !isUsername(candidate.value)) return null
  if (!hasValidRightBoundary(text, candidate.endIndex, 'user')) return null

  return {
    type: 'user',
    raw: text.slice(startIndex, candidate.endIndex),
    identifier: candidate.value.toLowerCase(),
    startIndex,
    endIndex: candidate.endIndex,
  }
}

function parseTopicMention(text: string, startIndex: number): EntityMention | null {
  const candidate = readWhile(text, startIndex + 1, char => TOPIC_IDENTIFIER_RE.test(char))
  if (!candidate) return null

  const identifier = candidate.value.toLowerCase()
  if (!isSlug(identifier) || !hasValidRightBoundary(text, candidate.endIndex, 'topic')) return null

  return {
    type: 'topic',
    raw: text.slice(startIndex, candidate.endIndex),
    identifier,
    startIndex,
    endIndex: candidate.endIndex,
  }
}

function parsePostMention(text: string, startIndex: number): PostMention | null {
  const next = text[startIndex + 1]
  if (!next) return null
  if (
    next === '/' ||
    text.startsWith('http://', startIndex + 1) ||
    text.startsWith('https://', startIndex + 1)
  ) {
    return parsePostUrlMention(text, startIndex)
  }

  const candidate = readWhile(text, startIndex + 1, char => POST_IDENTIFIER_RE.test(char))
  if (!candidate) return null

  const identifier = candidate.value.toLowerCase()
  if (!isUUID(candidate.value) && !isSlug(identifier)) return null
  if (!hasValidRightBoundary(text, candidate.endIndex, 'post')) return null

  return {
    type: 'post',
    raw: text.slice(startIndex, candidate.endIndex),
    identifier: isUUID(candidate.value) ? candidate.value.toLowerCase() : identifier,
    startIndex,
    endIndex: candidate.endIndex,
    source: 'identifier',
  }
}

function parsePostUrlMention(text: string, startIndex: number): PostMention | null {
  const parsed = parsePostUrlToken(text, startIndex + 1)
  if (!parsed || !hasValidRightBoundary(text, parsed.endIndex, 'post')) return null

  return {
    type: 'post',
    raw: text.slice(startIndex, parsed.endIndex),
    identifier: parsed.identifier,
    startIndex,
    endIndex: parsed.endIndex,
    source: parsed.source,
  }
}

function readWhile(text: string, startIndex: number, predicate: (char: string) => boolean) {
  let endIndex = startIndex
  while (endIndex < text.length && predicate(text[endIndex]!)) endIndex++
  if (endIndex === startIndex) return null
  return { value: text.slice(startIndex, endIndex), endIndex }
}
