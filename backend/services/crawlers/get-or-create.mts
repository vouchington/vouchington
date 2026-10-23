import { beginTransaction, write } from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'
import { isUUID } from '@modules/utils'
import type { PrivateUser } from '@services/users/types'
import createError from 'http-errors'
import sql from 'sql-template-strings'
import { toCrawler } from './get.mts'
import type { Crawler } from './types.mts'

export const getOrCreateCrawlersForHostnames = async (
  creator: PrivateUser | null,
  hostnameIds: readonly string[],
  options: QueryOptions = {},
): Promise<Map<string, Crawler>> => {
  const sortedHostnameIds = [...new Set(hostnameIds.map(id => id.toLowerCase()))].toSorted()
  if (sortedHostnameIds.length === 0) return new Map()
  for (const hostnameId of sortedHostnameIds) {
    if (!isUUID(hostnameId)) throw createError(422, `Invalid hostname ID: ${hostnameId}`)
  }

  if (options.query || options.client) {
    return getOrCreateCrawlersForHostnamesInTransaction(creator, sortedHostnameIds, options)
  }

  await using query = await beginTransaction()
  const crawlers = await getOrCreateCrawlersForHostnamesInTransaction(creator, sortedHostnameIds, {
    query,
  })
  await query.commit()
  return crawlers
}

export const getOrCreateCrawlerForHostname = async (
  creator: PrivateUser | null,
  hostnameId: string,
  options: QueryOptions = {},
): Promise<Crawler> => {
  const crawlers = await getOrCreateCrawlersForHostnames(creator, [hostnameId], options)
  return crawlers.get(hostnameId.toLowerCase())!
}

async function getOrCreateCrawlersForHostnamesInTransaction(
  creator: PrivateUser | null,
  hostnameIds: string[],
  options: QueryOptions,
): Promise<Map<string, Crawler>> {
  // Lock in stable order. The second statement gets a fresh snapshot after any
  // lock wait, so it sees a crawler committed by the transaction we waited on.
  await write(
    sql`/* getOrCreateCrawlersForHostnames:lock */
      SELECT pg_advisory_xact_lock(hashtext(input.hostname_id::text))
      FROM unnest(${hostnameIds}::uuid[]) AS input(hostname_id)
      ORDER BY input.hostname_id`,
    options,
  )

  const { rows } = await write(
    sql`/* getOrCreateCrawlersForHostnames */
      WITH existing AS MATERIALIZED (
        SELECT DISTINCT ON (c.hostname_id)
          c.id,
          c.hostname_id,
          c.description,
          c.crawler_type,
          c.priority,
          c.css_selectors_to_remove,
          c.link_text_content_to_remove,
          c.link_hrefs_to_remove,
          c.content_selectors,
          c.referral_program_topic_id AS referral_program_id,
          c.created_at,
          c.updated_at,
          c.deleted_at
        FROM hostname_crawler_configurations c
        WHERE c.hostname_id = ANY(${hostnameIds}::uuid[])
          AND c.deleted_at IS NULL
        ORDER BY c.hostname_id, c.priority DESC, c.id ASC
      ), inserted AS (
        INSERT INTO hostname_crawler_configurations (
          hostname_id,
          description,
          crawler_type,
          priority,
          css_selectors_to_remove,
          link_text_content_to_remove,
          link_hrefs_to_remove,
          content_selectors,
          created_by_id
        )
        SELECT
          input.hostname_id,
          '',
          'fetch'::crawler_types,
          0,
          ARRAY[]::TEXT[],
          ARRAY[]::TEXT[],
          ARRAY[]::TEXT[],
          ARRAY[]::TEXT[],
          ${creator?.id ?? null}
        FROM unnest(${hostnameIds}::uuid[]) AS input(hostname_id)
        WHERE NOT EXISTS (
          SELECT 1 FROM existing WHERE existing.hostname_id = input.hostname_id
        )
        RETURNING
          id,
          hostname_id,
          description,
          crawler_type,
          priority,
          css_selectors_to_remove,
          link_text_content_to_remove,
          link_hrefs_to_remove,
          content_selectors,
          referral_program_topic_id AS referral_program_id,
          created_at,
          updated_at,
          deleted_at
      )
      SELECT * FROM existing
      UNION ALL
      SELECT * FROM inserted`,
    options,
  )

  return new Map(
    rows.map(row => {
      const crawler = toCrawler(row)
      return [crawler.hostname_id, crawler]
    }),
  )
}
