import type { EntityMention } from '@services/entity-links/types'
import { isInsideHtmlTag, isInsideCode } from '@ts-shared/utils/html'
import { parseEntityMentions } from '@services/entity-links/parsers'
import { resolveEntityMentions } from '@services/entity-links/resolvers'
import { formatMentionAsHtml } from '@services/entity-links/formatters'
import { normalizeBangAutolinks } from '@services/entity-links/html-normalization'
import { renderMarkdownToHtmlBatch } from './index.mts'

type RenderEntity = {
  id: string
  markdown: string
  created_by_id?: string
}

/**
 * Renders a batch of markdown entities to HTML with optimized mention resolution.
 *
 * When `adminUserIds` is provided, admin-authored entities render with HTML allowed,
 * dofollow links, and image proxying. Non-admin entities render with strict mode,
 * nofollow links, and image proxying.
 *
 * @param entities - Array of objects with id, markdown, and optional created_by_id
 * @param adminUserIds - Set of admin user IDs for admin-mode rendering
 * @returns Record mapping entity IDs to rendered HTML
 */
export async function renderMarkdownBatch(
  entities: RenderEntity[],
  adminUserIds?: ReadonlySet<string>,
): Promise<Record<string, string>> {
  if (entities.length === 0) return {}

  let htmlValues: string[]

  if (adminUserIds && adminUserIds.size > 0) {
    // Partition entities into admin vs non-admin
    const adminEntities: Array<{ index: number; markdown: string }> = []
    const nonAdminEntities: Array<{ index: number; markdown: string }> = []

    for (let i = 0; i < entities.length; i++) {
      const entity = entities[i]!
      const isAdmin = entity.created_by_id ? adminUserIds.has(entity.created_by_id) : false
      if (isAdmin) {
        adminEntities.push({ index: i, markdown: entity.markdown })
      } else {
        nonAdminEntities.push({ index: i, markdown: entity.markdown })
      }
    }

    // Render both batches in parallel
    const [adminHtmlValues, nonAdminHtmlValues] = await Promise.all([
      adminEntities.length > 0
        ? renderMarkdownToHtmlBatch(
            adminEntities.map(e => e.markdown),
            { allowHtml: true, nofollowLinks: false, proxyImages: true },
          )
        : Promise.resolve([]),
      nonAdminEntities.length > 0
        ? renderMarkdownToHtmlBatch(
            nonAdminEntities.map(e => e.markdown),
            { allowHtml: false, nofollowLinks: true, proxyImages: true },
          )
        : Promise.resolve([]),
    ])

    // Merge results back in original order
    htmlValues = new Array(entities.length).fill('')
    for (let i = 0; i < adminEntities.length; i++) {
      htmlValues[adminEntities[i]!.index] = adminHtmlValues[i] ?? ''
    }
    for (let i = 0; i < nonAdminEntities.length; i++) {
      htmlValues[nonAdminEntities[i]!.index] = nonAdminHtmlValues[i] ?? ''
    }
  } else {
    // No admin info — render all with default strict mode + image proxying
    htmlValues = await renderMarkdownToHtmlBatch(
      entities.map(({ markdown }) => markdown),
      {
        allowHtml: false,
        nofollowLinks: true,
        proxyImages: true,
      },
    )
  }

  // 2. Parse mentions for each entity
  const htmlByIndex = new Map<number, string>()
  const mentionsByIndex = new Map<number, EntityMention[]>()

  for (let i = 0; i < htmlValues.length; i++) {
    const html = normalizeBangAutolinks(htmlValues[i] ?? '')
    htmlByIndex.set(i, html)

    const mentions = parseEntityMentions(html)
    const validMentions = mentions.filter(
      mention =>
        !isInsideHtmlTag(html, mention.startIndex) && !isInsideCode(html, mention.startIndex),
    )
    mentionsByIndex.set(i, validMentions)
  }

  // 3. Batch resolve all mentions (one query per type)
  const allMentions = Array.from(mentionsByIndex.values()).flat()
  const resolvedMentionsArray =
    allMentions.length > 0 ? await resolveEntityMentions(allMentions) : []

  const resolvedMentionsMap = new Map(
    resolvedMentionsArray.map(resolved => [resolved.raw, resolved]),
  )

  // 4. Apply replacements to each HTML using cached mentions
  const result: Record<string, string> = {}
  for (const [index, html] of htmlByIndex.entries()) {
    const entity = entities[index]
    if (!entity) continue

    const validMentions = mentionsByIndex.get(index) ?? []

    // Apply replacements in reverse order to preserve indices
    let finalHtml = html
    for (const mention of [...validMentions].reverse()) {
      const resolved = resolvedMentionsMap.get(mention.raw)
      if (resolved) {
        const replacement = formatMentionAsHtml(resolved)
        finalHtml =
          finalHtml.slice(0, mention.startIndex) + replacement + finalHtml.slice(mention.endIndex)
      }
    }

    result[entity.id] = finalHtml
  }

  return result
}
