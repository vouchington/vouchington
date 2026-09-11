import type { PrivateUser } from '@services/users/types'
import { isUUID } from '@modules/utils'
import { write } from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'
import { getCrawlerById, toCrawler } from './get.mts'
import assert from 'http-assert'
import createError from 'http-errors'
import type { UpdateCrawlerUpdates, Crawler } from './types.mts'
import sql from 'sql-template-strings'

export const updateCrawler = async (
  updater: PrivateUser,
  crawlerId: string,
  updates: UpdateCrawlerUpdates,
): Promise<Crawler> => {
  assert(crawlerId, 422, 'Crawler ID is required')
  if (updates.hostname_id && !isUUID(updates.hostname_id)) {
    throw createError(422, `Invalid hostname ID: ${updates.hostname_id}`)
  }
  if (updates.crawler_type) {
    assert(
      ['fetch', 'automation'].includes(updates.crawler_type),
      422,
      `Invalid crawler type: ${updates.crawler_type}`,
    )
  }
  if (updates.referral_program_id && !isUUID(updates.referral_program_id)) {
    throw createError(422, `Invalid referral program ID: ${updates.referral_program_id}`)
  }

  const hostnameId = resolveUpdateHostnameId(updates)
  const hasUpdates =
    hostnameId !== undefined ||
    updates.description !== undefined ||
    updates.crawler_type !== undefined ||
    updates.priority !== undefined ||
    updates.css_selectors_to_remove !== undefined ||
    updates.link_text_content_to_remove !== undefined ||
    updates.link_hrefs_to_remove !== undefined ||
    updates.content_selectors !== undefined ||
    updates.referral_program_id !== undefined

  if (!hasUpdates) {
    const crawler = await getCrawlerById(crawlerId)
    if (!crawler) throw createError(404, `Crawler not found: ${crawlerId}`)
    return crawler
  }

  const query = sql`/* updateCrawler */ UPDATE crawlers SET updated_by_id = ${updater.id}`
  if (hostnameId !== undefined) query.append(sql`, hostname_id = ${hostnameId}`)
  if (updates.description !== undefined) query.append(sql`, description = ${updates.description}`)
  if (updates.crawler_type !== undefined)
    query.append(sql`, crawler_type = ${updates.crawler_type}`)
  if (updates.priority !== undefined) query.append(sql`, priority = ${updates.priority}`)
  if (updates.css_selectors_to_remove !== undefined) {
    query.append(sql`, css_selectors_to_remove = ${updates.css_selectors_to_remove}`)
  }
  if (updates.link_text_content_to_remove !== undefined) {
    query.append(sql`, link_text_content_to_remove = ${updates.link_text_content_to_remove}`)
  }
  if (updates.link_hrefs_to_remove !== undefined) {
    query.append(sql`, link_hrefs_to_remove = ${updates.link_hrefs_to_remove}`)
  }
  if (updates.content_selectors !== undefined) {
    query.append(sql`, content_selectors = ${updates.content_selectors}`)
  }
  if (updates.referral_program_id !== undefined) {
    query.append(sql`, referral_program_id = ${updates.referral_program_id}`)
  }
  query.append(sql`
    WHERE id = ${crawlerId} AND deleted_at IS NULL
    RETURNING id, hostname_id, description, crawler_type, priority,
      css_selectors_to_remove, link_text_content_to_remove, link_hrefs_to_remove,
      content_selectors, referral_program_id,
      created_at, updated_at, deleted_at
  `)

  const { rows } = await write(query)
  if (rows.length === 0) throw createError(404, `Crawler not found: ${crawlerId}`)
  return toCrawler(rows[0])
}

export const updateCrawlerCssSelectorsByHostname = async (
  hostnameId: string,
  cssSelectorsToRemove: string[],
  queryOptions: QueryOptions = {},
): Promise<boolean> => {
  const selectorsToAppend = [...new Set(cssSelectorsToRemove)]
  if (selectorsToAppend.length === 0) return false

  const { rowCount } = await write(
    sql`/* updateCrawlerCssSelectorsByHostname */
    UPDATE crawlers
    SET css_selectors_to_remove = (
      SELECT ARRAY_AGG(value ORDER BY first_ord ASC)
      FROM (
        SELECT value, MIN(ord) AS first_ord
        FROM unnest(
          COALESCE(crawlers.css_selectors_to_remove, ARRAY[]::TEXT[]) || ${selectorsToAppend}::TEXT[]
        ) WITH ORDINALITY AS selectors(value, ord)
        GROUP BY value
      ) deduped
    )
    WHERE hostname_id = ${hostnameId}
      AND deleted_at IS NULL
      AND EXISTS (
        SELECT 1
        FROM unnest(${selectorsToAppend}::TEXT[]) AS candidate(value)
        WHERE NOT (
          candidate.value = ANY(COALESCE(crawlers.css_selectors_to_remove, ARRAY[]::TEXT[]))
        )
      )
  `,
    undefined,
    queryOptions,
  )

  return Number(rowCount || 0) > 0
}

function resolveUpdateHostnameId(updates: UpdateCrawlerUpdates): string | undefined {
  if (updates.hostname_id) return updates.hostname_id
  return undefined
}
