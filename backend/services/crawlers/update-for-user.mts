import assert from 'http-assert'
import type { PrivateUser } from '@services/users/types'
import { updateCrawler } from './update-crawler.mts'
import { currentUserCanEditCrawler } from './authorization.mts'
import type { UpdateCrawlerUpdates } from './types.mts'
import createError from 'http-errors'

export async function updateCrawlerForUser(
  currentUser: PrivateUser | null,
  crawlerId: string,
  updates: UpdateCrawlerUpdates,
) {
  assert(currentUserCanEditCrawler(currentUser), 403, 'Admin access required')
  if (!crawlerId) throw createError(422, `Invalid crawler ID: ${crawlerId}`)
  try {
    return await updateCrawler(currentUser!, crawlerId, updates)
  } catch (err) {
    if (
      err instanceof Error &&
      'status' in err &&
      err.status === 404 &&
      err.message === `Crawler not found: ${crawlerId}`
    ) {
      throw createError(404, 'Crawler not found', { cause: err })
    }
    throw err
  }
}
