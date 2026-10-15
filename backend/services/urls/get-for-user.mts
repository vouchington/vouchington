import assert from 'http-assert'
import type { PrivateUser } from '@services/users/types'
import { getUrlByAnyCached } from './get.mts'
import { currentUserCanTriggerCrawl } from './authorization.mts'

export async function assertUserCanTriggerCrawl(currentUser: PrivateUser | null, urlId: string) {
  assert(currentUserCanTriggerCrawl(currentUser), 403, 'Admin access required')

  const url = await getUrlByAnyCached(urlId)
  assert(url, 404, 'URL not found')

  return url
}
