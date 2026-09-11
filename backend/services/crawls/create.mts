import { write } from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'
import { isUUID } from '@modules/utils'
import type { CreateCrawlOptions, CrawlBasic } from './types.mts'
import createError from 'http-errors'

export const createCrawl = async (
  urlId: string,
  crawlerId: string,
  options: Omit<CreateCrawlOptions, 'url_id' | 'crawler_id'> = {},
  queryOptions: QueryOptions = {},
): Promise<CrawlBasic> => {
  if (!isUUID(urlId)) {
    throw createError(422, `Invalid URL ID: ${urlId}`)
  }
  if (!isUUID(crawlerId)) {
    throw createError(422, `Invalid crawler ID: ${crawlerId}`)
  }

  const { rows } = await write(
    `/* createCrawl */
    INSERT INTO crawls (
      url_id,
      crawler_id,
      last_modified_at,
      etag,
      request_headers,
      response_headers,
      response_status_code,
      markdown
    )
    VALUES ($1, $2, $3, $4, '{}'::jsonb, '{}'::jsonb, 200, '')
    RETURNING *
  `,
    [urlId, crawlerId, options.last_modified_at || null, options.etag || null],
    queryOptions,
  )

  return {
    __entity_type: 'crawl',
    ...rows[0],
  }
}
