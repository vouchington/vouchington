import { escapeHtml } from '@ts-shared/utils/html'
import { mentionConfigByType } from './config.mts'
import type { ResolvedMention } from './types.mts'

/**
 * Converts resolved mentions to HTML anchor tags
 */
export function formatMentionAsHtml(mention: ResolvedMention): string {
  if (mention.type === 'unresolved') {
    return mention.raw
  }

  const config = mentionConfigByType.get(mention.type)
  if (!config) return mention.raw

  const safeTitle = escapeHtml(config.getTitle(mention))
  const safeText = escapeHtml(config.getText(mention))
  return `<a href="${mention.url}" class="${config.className}" title="${safeTitle}">${safeText}</a>`
}
