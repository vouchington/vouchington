import assert from 'http-assert'
import type { BasicUser } from '@services/users/types'
import type { ContentProvenance } from '@voucha/types/entities/content-provenance'
import { assertWithinContributionShortLimit } from '@services/contribution-gating/limits'
import { submitRssFeedImport } from '@services/user-import-export/rss-feed-imports'
import { validateRssFeedUrl } from '@services/user-import-export/validate-rss-feed-url'
import { enqueueUserRssFeedImportDispatch } from '@queues/user-rss-feed-imports/enqueues'
import onError from '@modules/on-error'
import { getUserActivePlan } from '@services/memberships'

export async function submitRssFeedSource(
  currentUser: BasicUser,
  provenance: ContentProvenance,
  rawUrl: string,
  follow = true,
) {
  const validation = validateRssFeedUrl(rawUrl)
  assert(validation.valid, 422, 'rss_feed_url must be a valid URL')
  // The worker charges the daily quota only when it creates a feed, so admission charges just the
  // short window.
  await assertWithinContributionShortLimit(
    currentUser,
    await getUserActivePlan(currentUser.id),
    'rss_feed',
  )
  const submitted = await submitRssFeedImport(currentUser, provenance, [validation.canonicalUrl], {
    should_follow_imported_feeds: follow,
  })
  // The import is committed; an enqueue outage is reported and the recovery sweep dispatches it.
  await enqueueUserRssFeedImportDispatch(submitted.import.id).catch(onError)
  return {
    import: submitted.import,
    status_url: `/api/v1/my/import/rss-feeds/${submitted.import.id}`,
  }
}
