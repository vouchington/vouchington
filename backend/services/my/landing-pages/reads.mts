import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { validateUUID } from '@modules/utils'
import assert from 'http-assert'
import type { LandingPage, LandingPageItemRow } from './types.mts'
import type { TransactionQuery } from '@data-stores/psql/types'

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
    SELECT id, item_type, profile_link_id, review_id, referral_link_id, topic_id, link_label, link_url
    FROM user_landing_page_items
    WHERE landing_page_id = ${pageId}
    ORDER BY sort_order ASC, id ASC
  `)
  return rows as LandingPageItemRow[]
}

export async function getUserMarkdown(userId: string): Promise<string> {
  const { rows } = await read(
    sql`/* getUserMarkdown */ SELECT markdown FROM users WHERE id = ${userId} AND deleted_at IS NULL LIMIT 1`,
  )
  return (rows[0]?.markdown as string | null) ?? ''
}
