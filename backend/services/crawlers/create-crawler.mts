import type { PrivateUser } from '@services/users/types'
import { isUUID } from '@modules/utils'
import { beginTransaction, write } from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'
import { getCrawlerById, getCrawlerForHostnameId } from './get.mts'
import assert from 'http-assert'
import type { CreateCrawlerUpdates, Crawler } from './types.mts'
import sql from 'sql-template-strings'

export const createCrawler = async (
  creator: PrivateUser | null,
  updates: CreateCrawlerUpdates,
  options: QueryOptions = {},
): Promise<Crawler> => {
  assert(updates.crawler_type, 422, 'Crawler type is required')
  assert(
    ['fetch', 'automation'].includes(updates.crawler_type),
    422,
    `Invalid crawler type: ${updates.crawler_type}`,
  )

  const hostnameId = resolveHostnameId(creator, updates)
  const { rows } = await write(
    sql`/* createCrawler */
    INSERT INTO crawlers (
      hostname_id,
      description,
      crawler_type,
      priority,
      css_selectors_to_remove,
      link_text_content_to_remove,
      link_hrefs_to_remove,
      content_selectors,
      referral_program_id,
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

  return (await getCrawlerById(rows[0].id, options))!
}

const createCrawlerForHostname = async (
  creator: PrivateUser | null,
  hostnameId: string,
  options: QueryOptions = {},
): Promise<Crawler> => {
  const { rows } = await write(
    sql`/* createCrawlerForHostname */
    INSERT INTO crawlers (
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
    VALUES (
      ${hostnameId},
      '',
      'fetch'::crawler_types,
      0,
      ARRAY[]::TEXT[],
      ARRAY[]::TEXT[],
      ARRAY[]::TEXT[],
      ARRAY[]::TEXT[],
      ${creator?.id || null}
    )
    RETURNING id
  `,
    options,
  )

  return (await getCrawlerById(rows[0].id, options))!
}

export const getOrCreateCrawlerForHostname = async (
  creator: PrivateUser | null,
  hostnameId: string,
  options: QueryOptions = {},
): Promise<Crawler> => {
  // Advisory lock prevents duplicate crawlers for the same hostname. A UNIQUE
  // constraint on hostname_id isn't possible since multiple crawlers per
  // hostname are allowed (for custom rules), so we use a transaction-scoped
  // lock instead of INSERT ... ON CONFLICT.
  const queryOptions = options.query ? { query: options.query } : options.client ? options : null
  if (queryOptions) {
    return getOrCreateCrawlerForHostnameInTransaction(creator, hostnameId, queryOptions)
  }

  await using query = await beginTransaction()
  const result = await getOrCreateCrawlerForHostnameInTransaction(creator, hostnameId, { query })
  await query.commit()
  return result
}

async function getOrCreateCrawlerForHostnameInTransaction(
  creator: PrivateUser | null,
  hostnameId: string,
  options: QueryOptions,
): Promise<Crawler> {
  await write(
    sql`/* getOrCreateCrawlerForHostnameInTransaction */ SELECT pg_advisory_xact_lock(hashtext(${hostnameId}))`,
    options,
  )

  const existing = await getCrawlerForHostnameId(hostnameId, options)
  if (existing) {
    return existing
  }

  return createCrawlerForHostname(creator, hostnameId, options)
}

function resolveHostnameId(_creator: PrivateUser | null, updates: CreateCrawlerUpdates): string {
  assert(updates.hostname_id, 422, 'hostname_id is required')
  assert(isUUID(updates.hostname_id), 422, `Invalid hostname ID: ${updates.hostname_id}`)
  return updates.hostname_id
}
