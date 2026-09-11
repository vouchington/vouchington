import assert from 'http-assert'
import type { PrivateUser } from '@services/users/types'
import { getCrawlerById } from './get.mts'
import { currentUserCanViewCrawler } from './authorization.mts'

export async function getCrawlerByIdForUser(currentUser: PrivateUser | null, id: string) {
  assert(currentUserCanViewCrawler(currentUser), 403, 'Admin access required')

  const crawler = await getCrawlerById(id)
  assert(crawler, 404, 'Crawler not found')

  return crawler
}
