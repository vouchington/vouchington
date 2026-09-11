import assert from 'http-assert'
import type { PrivateUser } from '@services/users/types'
import { updateCrawler } from './update-crawler.mts'
import { getCrawlerById } from './get.mts'
import { currentUserCanEditCrawler } from './authorization.mts'
import type { UpdateCrawlerUpdates } from './types.mts'

export async function updateCrawlerForUser(
  currentUser: PrivateUser | null,
  crawlerId: string,
  updates: UpdateCrawlerUpdates,
) {
  assert(currentUserCanEditCrawler(currentUser), 403, 'Admin access required')

  const crawler = await getCrawlerById(crawlerId)
  assert(crawler, 404, 'Crawler not found')

  return await updateCrawler(currentUser!, crawlerId, updates)
}
