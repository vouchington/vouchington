import { parseEntityMentions } from './parsers.mts'
import { resolveEntityMentions } from './resolvers.mts'
import { formatMentionAsHtml } from './formatters.mts'
import { isInsideHtmlTag, isInsideCode } from '@ts-shared/utils/html'
import { normalizeBangAutolinks } from './html-normalization.mts'

/**
 * Main function: Replaces entity mentions in text with HTML links
 * Skips mentions inside HTML tags and code blocks
 */
export async function replaceEntityMentions(text: string): Promise<string> {
  const normalizedText = normalizeBangAutolinks(text)
  const mentions = parseEntityMentions(normalizedText)

  if (mentions.length === 0) {
    return text
  }

  const resolved = await resolveEntityMentions(mentions)

  // Filter out mentions that are inside HTML tags or code blocks
  const validMentions: typeof mentions = []
  const validResolved: typeof resolved = []

  for (let i = 0; i < mentions.length; i++) {
    const mention = mentions[i]
    const resolvedMention = resolved[i]

    if (mention && resolvedMention) {
      // Skip if inside HTML tag or code block
      if (
        isInsideHtmlTag(normalizedText, mention.startIndex) ||
        isInsideCode(normalizedText, mention.startIndex)
      ) {
        continue
      }

      validMentions.push(mention)
      validResolved.push(resolvedMention)
    }
  }

  // Replace valid mentions in reverse order to preserve indices
  let result = normalizedText
  const reversedMentions = [...validMentions].toReversed()
  const reversedResolved = [...validResolved].toReversed()

  for (let i = 0; i < reversedMentions.length; i++) {
    const mention = reversedMentions[i]
    const resolvedMention = reversedResolved[i]

    if (mention && resolvedMention) {
      const replacement = formatMentionAsHtml(resolvedMention)
      result = result.slice(0, mention.startIndex) + replacement + result.slice(mention.endIndex)
    }
  }

  return result
}
