import assert from 'http-assert'
import type { PrivateUser } from '@services/users/types'
import { caches } from '@services/entity-cache/caches'
import { getUrlByAny } from './get.mts'
import { currentUserCanTriggerCrawl } from './authorization.mts'

// Reconstructed locally rather than imported from @services/entity-fetch: entity-fetch already
// depends on @services/urls, so importing entity-fetch's cached getter back into urls would
// create a fresh urls<->entity-fetch cycle. This is the same cache instance/TTL/invalidation-keys
// as entity-fetch's getUrlByAnyCached — just the raw getter wrapped locally instead.
const getUrlByAnyCached = caches.urls.cacheGetByAny(getUrlByAny)

export async function assertUserCanTriggerCrawl(currentUser: PrivateUser | null, urlId: string) {
  assert(currentUserCanTriggerCrawl(currentUser), 403, 'Admin access required')

  const url = await getUrlByAnyCached(urlId)
  assert(url, 404, 'URL not found')

  return url
}
