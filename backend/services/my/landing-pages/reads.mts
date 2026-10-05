import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { validateUUID } from '@modules/utils'
import assert from 'http-assert'
import type { LandingPage, LandingPageItemRow } from './types.mts'
import { lockUserLandingPages } from './shared.mts'
import type { TransactionQuery } from '@data-stores/psql/types'

export async function getLockedLandingPageRowForUser(
  userId: string,
  pageId: string,
  query: TransactionQuery,
): Promise<LandingPage> {
  await lockUserLandingPages(query, userId)
  return getLandingPageRowForUser(userId, pageId, { query })
}

export async function getLandingPageRowForUser(
  userId: string,
  pageId: string,
  options?: { query?: TransactionQuery },
): Promise<LandingPage> {
  validateUUID(userId)
  validateUUID(pageId)
  const executor = options?.query ?? read
  const { rows } = await executor(sql`/* getLandingPageRowForUser */
    SELECT id, user_id, title, subtitle, slug, is_default, created_at, updated_at
    FROM user_landing_pages
    WHERE id = ${pageId} AND user_id = ${userId}
    LIMIT 1
  `)
  assert(rows[0], 404, 'Landing page not found')
  return rows[0] as LandingPage
}

export async function getLandingPageRowById(pageId: string): Promise<LandingPage> {
  validateUUID(pageId)
  const { rows } = await read(sql`/* getLandingPageRowById */
    SELECT id, user_id, title, subtitle, slug, is_default, created_at, updated_at
    FROM user_landing_pages
    WHERE id = ${pageId}
    LIMIT 1
  `)
  assert(rows[0], 404, 'Landing page not found')
  return rows[0] as LandingPage
}

export async function getLandingPageItemRows(pageId: string): Promise<LandingPageItemRow[]> {
  const { rows } = await read(sql`/* getLandingPageItemRows */
    SELECT item.id, item.item_type, item.profile_link_id, item.review_post_id, item.referral_link_id,
      item.topic_id, item.link_label, item.url_id,
      CASE WHEN hostname.is_blocked = FALSE THEN link.url END AS url
    FROM user_landing_page_items item
    LEFT JOIN urls link ON link.id = item.url_id
    LEFT JOIN url_hostnames hostname ON hostname.id = link.hostname_id
    WHERE item.landing_page_id = ${pageId}
    ORDER BY item.sort_order ASC, item.id ASC
  `)
  return rows as LandingPageItemRow[]
}

export async function getUserMarkdown(userId: string): Promise<string> {
  const { rows } = await read(
    sql`/* getUserMarkdown */ SELECT markdown FROM users WHERE id = ${userId} AND deleted_at IS NULL LIMIT 1`,
  )
  return (rows[0]?.markdown as string | null) ?? ''
}
