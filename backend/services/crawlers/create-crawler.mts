import { recordModeratorAction } from '@services/moderator-actions'
import { crawlerHistorySnapshot } from './history.mts'
import type { PrivateUser } from '@services/users/types'
import { isUUID } from '@modules/utils'
import { beginTransaction, write } from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'
import { getCrawlerById } from './get.mts'
import assert from 'http-assert'
import type { CreateCrawlerUpdates, Crawler } from './types.mts'
import sql from 'sql-template-strings'

export const createCrawler = async (
  creator: PrivateUser | null,
  updates: CreateCrawlerUpdates,
  options: QueryOptions = {},
): Promise<Crawler> => {
  if (!options.query) {
    await using query = await beginTransaction(
      options.client ? { client: options.client } : undefined,
    )
    const crawler = await createCrawler(creator, updates, { query })
    await query.commit()
    return crawler
  }
  assert(updates.crawler_type, 422, 'Crawler type is required')
  assert(
    ['fetch', 'automation'].includes(updates.crawler_type),
    422,
    `Invalid crawler type: ${updates.crawler_type}`,
  )

  const hostnameId = resolveHostnameId(creator, updates)
  const { rows } = await write(
    sql`/* createCrawler */
    INSERT INTO hostname_crawler_configurations (
      hostname_id,
      description,
      crawler_type,
      priority,
      css_selectors_to_remove,
      link_text_content_to_remove,
      link_hrefs_to_remove,
      content_selectors,
      referral_program_topic_id,
      created_by_id
    )
    VALUES (
      ${hostnameId},
      ${updates.description || ''},
      ${updates.crawler_type},
      ${updates.priority ?? 0},
      ${updates.css_selectors_to_remove || []},
      ${updates.link_text_content_to_remove || []},
      ${updates.link_hrefs_to_remove || []},
      ${updates.content_selectors || []},
      ${updates.referral_program_id ?? null},
      ${creator?.id || null}
    )
    RETURNING id
  `,
    options,
  )

  const crawler = (await getCrawlerById(rows[0].id, options))!
  if (creator?.roles.includes('administrator')) {
    await recordModeratorAction(
      creator.id,
      {
        actionType: 'crawler_create',
        crawlerId: crawler.id,
        metadata: { after: crawlerHistorySnapshot(crawler) },
      },
      options,
    )
  }
  return crawler
}

function resolveHostnameId(_creator: PrivateUser | null, updates: CreateCrawlerUpdates): string {
  assert(updates.hostname_id, 422, 'hostname_id is required')
  assert(isUUID(updates.hostname_id), 422, `Invalid hostname ID: ${updates.hostname_id}`)
  return updates.hostname_id
}
