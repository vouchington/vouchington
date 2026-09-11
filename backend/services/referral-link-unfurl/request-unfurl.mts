import assert from 'http-assert'
import type { PrivateUser } from '@services/users/types'
import { validateUUID } from '@modules/utils'
import { assertNotSuspended } from '@services/users/suspension'
import { getMembershipByUserId } from '@services/memberships'
import { hasPlusTier } from '@modules/membership-helpers'
import { getTopicByAny } from '@services/topics/get'
import {
  getUserReferralLink,
  currentUserCanUpdateUserReferralLink,
  markReferralLinkUnfurlRequested,
  type UserReferralLink,
} from '@services/user-referral-program-links'
import { enqueueUnfurlReferralLink } from '@queues/unfurl-referral-links/enqueues'

const AMEX_ALL_CARDS_PROGRAM_SLUG = 'amex-referral-program'

/**
 * Requests an unfurl of a parent referral link (decision #2: the browser crawl never sits
 * on the create path). Ownership, suspension, and the paid gate are all enforced here
 * before intent is persisted and the job enqueued -- the async processor
 * (`runReferralLinkUnfurl`) re-checks the paid gate independently in case the owner's
 * membership changes between request and processing.
 */
export async function requestReferralLinkUnfurl(
  currentUser: PrivateUser | null,
  linkId: string,
): Promise<UserReferralLink> {
  assert(currentUser, 401, 'User not logged in')
  assertNotSuspended(currentUser)
  validateUUID(linkId)

  const link = await getUserReferralLink(linkId)
  assert(link, 404, 'Referral link not found')
  assert(currentUserCanUpdateUserReferralLink(currentUser, link), 403, 'Forbidden')
  assert(!link.parent_link_id, 403, 'Child referral links are managed via their parent')

  const topic = await getTopicByAny(link.referral_program_id)
  assert(
    topic && topic.slug === AMEX_ALL_CARDS_PROGRAM_SLUG,
    422,
    'Only Amex all-cards referral links can be unfurled',
  )

  // The paid gate is on the link owner's membership, not the acting user's -- an
  // administrator triggering unfurl on behalf of a free user does not bypass this.
  const membership = await getMembershipByUserId(link.user_id)
  assert(hasPlusTier(membership), 403, 'Premium membership required')

  // Persist intent before enqueue so the dispatcher can self-heal a lost enqueue.
  const updated = await markReferralLinkUnfurlRequested(linkId)
  assert(updated, 404, 'Referral link not found')

  await enqueueUnfurlReferralLink({ parentLinkId: linkId })

  return updated
}
