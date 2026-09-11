import assert from 'http-assert'
import { addUrl } from '@services/urls'
import type { QueryOptions, TransactionQuery } from '@data-stores/psql/types'

type CreateRssFeedUrlIdOptions = QueryOptions & {
  preserveHttp?: boolean
  addUrlImpl?: typeof addUrl
}

export async function createRssFeedUrlId(
  rssFeedUrl: string,
  options: CreateRssFeedUrlIdOptions = {},
): Promise<string> {
  const { preserveHttp, addUrlImpl, ...queryOptions } = options
  const resolvedQueryOptions =
    queryOptions.query && 'client' in queryOptions.query
      ? { ...queryOptions, client: (queryOptions.query as TransactionQuery).client }
      : queryOptions
  const rssFeedUrlRow = await (addUrlImpl ?? addUrl)(null, rssFeedUrl, {
    content_type: 'application/rss+xml',
    preserveHttp,
    ...resolvedQueryOptions,
  })
  assert(rssFeedUrlRow, 500, 'Failed to create RSS feed URL')
  return rssFeedUrlRow.id
}
