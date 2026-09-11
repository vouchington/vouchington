import type { EntityMention } from './types.mts'
import { hasValidLeftBoundary } from './parser-boundaries.mts'
import { parsePrefixedMention } from './parser-prefixes.mts'

const PREFIXES = new Set(['@', '#', '!'])

/**
 * Parses text to find entity mentions (@username, #topic, !post)
 */
export function parseEntityMentions(text: string): EntityMention[] {
  const mentions: EntityMention[] = []

  for (let i = 0; i < text.length; i++) {
    const prefix = text[i]
    if (!prefix || !PREFIXES.has(prefix)) continue
    if (!hasValidLeftBoundary(text, i)) continue

    const mention = parsePrefixedMention(text, i, prefix)
    if (mention) {
      mentions.push(mention)
      i = mention.endIndex - 1
    }
  }

  return mentions
}
