import assert from 'http-assert'
import type { BasicUser } from '@services/users/types'
import type { ContentProvenance } from '@voucha/types/entities/content-provenance'
import { assertWithinContributionSubmissionLimit } from '@services/contribution-gating/limits'
import { submitAndDispatchRssFeedImport } from '@services/user-import-export/rss-feed-imports'
import { validateRssFeedUrl } from '@services/user-import-export/validate-rss-feed-url'
import { getUserActivePlan } from '@services/memberships'

export async function submitRssFeedSource(
  currentUser: BasicUser,
  provenance: ContentProvenance,
  rawUrl: string,
  follow = true,
) {
  const validation = validateRssFeedUrl(rawUrl)
  assert(validation.valid, 422, 'rss_feed_url must be a valid URL')
  await assertWithinContributionSubmissionLimit(
    currentUser,
    await getUserActivePlan(currentUser.id),
    'rss_feed',
  )
  return submitAndDispatchRssFeedImport(currentUser, provenance, [validation.canonicalUrl], {
    should_follow_imported_feeds: follow,
  })
}
