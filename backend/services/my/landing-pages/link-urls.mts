import type { TransactionQuery } from '@data-stores/psql/types'
import { normalizeUrlForUrlTable } from '@modules/utils/urls'
import { addUrls } from '@services/urls/upsert'
import assert from 'http-assert'
import type { LandingPageItemInput } from './types.mts'

export async function registerLandingPageLinkUrls(
  userId: string,
  items: LandingPageItemInput[],
  query: TransactionQuery,
) {
  const inputs = items.flatMap(item => (item.type === 'link' ? [item.url.trim()] : []))
  const records = await addUrls(userId, inputs, { query, client: query.client })
  const idsByUrl = new Map(records.map(url => [url.url, url.id]))
  const idsByInput = new Map<string, string>()
  for (const input of inputs) {
    const id = idsByUrl.get(normalizeUrlForUrlTable(input).toString())
    assert(id, 422, 'Link must have a public hostname')
    idsByInput.set(input, id)
  }
  return { records, idsByInput }
}
