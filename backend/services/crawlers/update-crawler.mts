import { recordModeratorAction } from '@services/moderator-actions'
import { crawlerHistorySnapshot } from './history.mts'
import type { PrivateUser } from '@services/users/types'
import { isUUID } from '@modules/utils'
import { runWithTransaction, write, type TransactionQuery } from '@data-stores/psql'
import { getCrawlerById, toCrawler } from './get.mts'
import assert from 'http-assert'
import createError from 'http-errors'
import type { UpdateCrawlerUpdates, Crawler } from './types.mts'
import sql from 'sql-template-strings'
import { lockTopicRssFeedAttachmentLifecycles } from '@services/post-publication/lock'
import { validateCrawlerUpdates } from './update-crawler-validation.mts'

export { updateCrawlerCssSelectorsByHostname } from './update-crawler-css-selectors.mts'

export const updateCrawler = async (
  updater: PrivateUser,
  crawlerId: string,
  updates: UpdateCrawlerUpdates,
  options: { query?: TransactionQuery } = {},
): Promise<Crawler> => {
  assert(crawlerId, 422, 'Crawler ID is required')
  if (!isUUID(crawlerId)) throw createError(422, `Invalid crawler ID: ${crawlerId}`)

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
    const crawler = await getCrawlerById(crawlerId, { query: options.query })
    if (!crawler) throw createError(404, `Crawler not found: ${crawlerId}`)
    return crawler
  }

  return runWithTransaction(options.query, async (transaction: TransactionQuery) => {
    let priorReferralProgramId: string | null = null
    if (updates.referral_program_id !== undefined) {
      const prior = await transaction<{ referral_program_topic_id: string | null }>(
        sql`/* updateCrawler:priorReferralProgram */
          SELECT referral_program_topic_id FROM hostname_crawler_configurations
          WHERE id = ${crawlerId} AND deleted_at IS NULL`,
      )
      if (prior.rows.length === 0) throw createError(404, `Crawler not found: ${crawlerId}`)
      await validateCrawlerUpdates(updates, transaction)
      priorReferralProgramId = prior.rows[0]?.referral_program_topic_id ?? null
      await lockTopicRssFeedAttachmentLifecycles(
        transaction,
        [priorReferralProgramId, updates.referral_program_id].filter(
          (topicId): topicId is string => topicId !== null,
        ),
      )
    }
    await transaction(
      sql`/* updateCrawler:lock */ SELECT id FROM hostname_crawler_configurations WHERE id = ${crawlerId} AND deleted_at IS NULL FOR UPDATE`,
    )
    const previous = await getCrawlerById(crawlerId, { query: transaction })
    if (!previous) throw createError(404, `Crawler not found: ${crawlerId}`)
    if (updates.referral_program_id === undefined)
      await validateCrawlerUpdates(updates, transaction)
    if (
      updates.referral_program_id !== undefined &&
      previous.referral_program_id !== priorReferralProgramId &&
      previous.referral_program_id !== updates.referral_program_id &&
      previous.referral_program_id !== null
    )
      throw createError(409, 'Crawler referral program changed while acquiring attachment fences')
    const query = sql`/* updateCrawler */ UPDATE hostname_crawler_configurations SET updated_by_id = ${updater.id}`
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
      query.append(sql`, referral_program_topic_id = ${updates.referral_program_id}`)
    }
    query.append(sql`
    WHERE id = ${crawlerId} AND deleted_at IS NULL
    RETURNING id, hostname_id, description, crawler_type, priority,
      css_selectors_to_remove, link_text_content_to_remove, link_hrefs_to_remove,
      content_selectors, referral_program_topic_id AS referral_program_id,
      created_at, updated_at, deleted_at
  `)

    const { rows } = await write(query, { query: transaction })
    if (rows.length === 0) throw createError(404, `Crawler not found: ${crawlerId}`)
    const crawler = toCrawler(rows[0])
    await recordModeratorAction(
      updater.id,
      {
        actionType: 'crawler_update',
        crawlerId,
        metadata: {
          before: crawlerHistorySnapshot(previous),
          after: crawlerHistorySnapshot(crawler),
        },
      },
      { query: transaction },
    )
    return crawler
  })
}

function resolveUpdateHostnameId(updates: UpdateCrawlerUpdates): string | undefined {
  if (updates.hostname_id) return updates.hostname_id
  return undefined
}
