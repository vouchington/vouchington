import { read } from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'
import { isUUID } from '@modules/utils'
import type { Crawler } from './types.mts'
import createError from 'http-errors'

export const getCrawlerById = async (
  id: string,
  options: QueryOptions = {},
): Promise<Crawler | null> => {
  if (!isUUID(id)) {
    throw createError(422, `Invalid crawler ID: ${id}`)
  }

  const { rows } = await read(
    `/* getCrawlerById */
    SELECT
      c.id,
      c.hostname_id,
      c.description,
      c.crawler_type,
      c.priority,
      c.css_selectors_to_remove,
      c.link_text_content_to_remove,
      c.link_hrefs_to_remove,
      c.content_selectors,
      c.referral_program_id,
      c.created_at,
      c.updated_at,
      c.deleted_at
    FROM crawlers c
    WHERE c.id = $1
      AND c.deleted_at IS NULL
    LIMIT 1
  `,
    [id],
    options,
  )

  if (rows.length === 0) return null

  return toCrawler(rows[0])
}

export const getCrawlerForHostnameId = async (
  hostnameId: string,
  options: QueryOptions = {},
): Promise<Crawler | null> => {
  if (!isUUID(hostnameId)) {
    throw createError(422, `Invalid hostname ID: ${hostnameId}`)
  }

  const { rows } = await read(
    `/* getCrawlerForHostnameId */
    SELECT
      c.id,
      c.hostname_id,
      c.description,
      c.crawler_type,
      c.priority,
      c.css_selectors_to_remove,
      c.link_text_content_to_remove,
      c.link_hrefs_to_remove,
      c.content_selectors,
      c.referral_program_id,
      c.created_at,
      c.updated_at,
      c.deleted_at
    FROM crawlers c
    WHERE c.hostname_id = $1
      AND c.deleted_at IS NULL
    ORDER BY c.priority DESC, c.id ASC
    LIMIT 1
  `,
    [hostnameId],
    options,
  )

  if (rows.length === 0) return null

  return toCrawler(rows[0])
}

export const getCrawlersForHostname = async (
  hostnameId: string,
  options: QueryOptions = {},
): Promise<Crawler[]> => {
  if (!isUUID(hostnameId)) {
    throw createError(422, `Invalid hostname ID: ${hostnameId}`)
  }

  const { rows } = await read(
    `/* getCrawlersForHostname */
    SELECT
      c.id,
      c.hostname_id,
      c.description,
      c.crawler_type,
      c.priority,
      c.css_selectors_to_remove,
      c.link_text_content_to_remove,
      c.link_hrefs_to_remove,
      c.content_selectors,
      c.referral_program_id,
      c.created_at,
      c.updated_at,
      c.deleted_at
    FROM crawlers c
    WHERE c.hostname_id = $1
      AND c.deleted_at IS NULL
    ORDER BY c.priority DESC, c.id ASC
  `,
    [hostnameId],
    options,
  )

  return rows.map(toCrawler)
}

export const getCrawlerForUrl = async (
  url: string,
  options: QueryOptions = {},
): Promise<Crawler | null> => {
  let urlObj: URL
  try {
    urlObj = new URL(url)
  } catch {
    throw createError(422, `Invalid URL: ${url}`)
  }

  const { rows } = await read(
    `/* getCrawlerForUrl */
    SELECT
      c.id,
      c.hostname_id,
      c.description,
      c.crawler_type,
      c.priority,
      c.css_selectors_to_remove,
      c.link_text_content_to_remove,
      c.link_hrefs_to_remove,
      c.content_selectors,
      c.referral_program_id,
      c.created_at,
      c.updated_at,
      c.deleted_at
    FROM crawlers c
    JOIN url_hostnames h
      ON h.id = c.hostname_id
    WHERE h.hostname = $1
      AND c.deleted_at IS NULL
    ORDER BY c.priority DESC, c.id ASC
    LIMIT 1
  `,
    [urlObj.hostname.toLowerCase()],
    options,
  )

  if (rows.length === 0) return null

  return toCrawler(rows[0])
}

export function toCrawler(row: Record<string, unknown>): Crawler {
  return {
    __entity_type: 'crawler',
    id: row.id as string,
    hostname_id: row.hostname_id as string,
    description: row.description as string,
    crawler_type: row.crawler_type as Crawler['crawler_type'],
    priority: Number(row.priority),
    css_selectors_to_remove: (row.css_selectors_to_remove as string[]) || [],
    link_text_content_to_remove: (row.link_text_content_to_remove as string[]) || [],
    link_hrefs_to_remove: (row.link_hrefs_to_remove as string[]) || [],
    content_selectors: (row.content_selectors as string[]) || [],
    referral_program_id: (row.referral_program_id as string | null) ?? null,
    created_at: row.created_at as Date,
    updated_at: row.updated_at as Date,
    created_by: null,
    updated_by: null,
    deleted_by: null,
    deleted_at: row.deleted_at as Date | null,
  }
}
