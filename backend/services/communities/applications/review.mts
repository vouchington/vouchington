import { beginTransaction, write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import assert from 'http-assert'
import type { PrivateUser } from '@services/users/types'
import { getPrivateUserByAny } from '@services/users/get'
import { getCommunityMember } from '../members/get.mts'
import { currentUserCanModerateCommunity } from '../authorization.mts'
import { getCommunity } from '../get.mts'
import { lockAndAssertNotBanned } from '../bans/lock.mts'
import { getApplication } from './get.mts'
import { recordModeratorAction } from '@services/moderator-actions'
import { enqueueSendCommunityApplicationDecisionEmail } from '@queues/emails/enqueues'
import { getSiteUrl } from '@modules/utils'
import {
  createCommunityLifecycleNotification,
  enqueueCommunityLifecycleNotificationPush,
} from '@services/notifications'
import { invalidateCommunityMemberUserMetrics } from '../members/invalidate-user-metrics.mts'

export async function approveApplication(
  currentUser: PrivateUser,
  applicationId: string,
): Promise<void> {
  const application = await getApplication(applicationId)
  assert(application, 404, 'Application not found')
  assert(
    !application.approved_at && !application.rejected_at,
    422,
    'Application has already been reviewed',
  )

  const [community, membership] = await Promise.all([
    getCommunity(application.community_id),
    getCommunityMember(application.community_id, currentUser.id),
  ])
  assert(community, 404, 'Community not found')
  assert(!community.archived_at, 409, 'Archived communities cannot be updated')
  assert(currentUserCanModerateCommunity(currentUser, community, membership), 403, 'Forbidden')

  await using query = await beginTransaction()
  const options = { query }

  // Serialize against a concurrent ban for the applicant so the ban check + membership
  // insert below are atomic.
  await lockAndAssertNotBanned(application.community_id, application.user_id, options)

  const { rowCount } = await write(
    sql`/* approveApplication */
    UPDATE community_applications
    SET reviewed_at = CURRENT_TIMESTAMP,
        reviewed_by_id = ${currentUser.id},
        approved_at = CURRENT_TIMESTAMP
    WHERE id = ${applicationId}
      AND approved_at IS NULL
      AND rejected_at IS NULL
    `,
    options,
  )
  assert(rowCount === 1, 422, 'Application has already been reviewed')

  await write(
    sql`/* approveApplication */
    INSERT INTO community_members (community_id, user_id, role, approved_by_id)
    VALUES (${application.community_id}, ${application.user_id}, 'member', ${currentUser.id})
    ON CONFLICT (community_id, user_id) WHERE removed_at IS NULL DO NOTHING
    `,
    options,
  )
  const notification = await createCommunityLifecycleNotification(
    {
      userId: application.user_id,
      communityId: application.community_id,
      entityType: 'community_application_decision',
      eventKey: `community-application-decision:${applicationId}`,
      title: `Your application to ${community.name} was approved`,
      body: `You are now a member of ${community.name}.`,
    },
    options,
  )

  await query.commit()
  await invalidateCommunityMemberUserMetrics(application.user_id)
  if (notification) await enqueueCommunityLifecycleNotificationPush([notification])
  const [, applicant] = await Promise.all([
    recordModeratorAction(currentUser.id, {
      actionType: 'approve',
      communityId: application.community_id,
      communityApplicationId: applicationId,
      targetUserId: application.user_id,
    }),
    getPrivateUserByAny(application.user_id),
  ])
  if (applicant) {
    void enqueueSendCommunityApplicationDecisionEmail(
      {
        userId: applicant.id,
        uiLocale: applicant.ui_locale ?? null,
      },
      {
        communityName: community.name,
        communityUrl: getSiteUrl(`/communities/${community.slug}`),
        status: 'approved',
      },
    )
  }
}

export async function rejectApplication(
  currentUser: PrivateUser,
  applicationId: string,
  reason?: string,
): Promise<void> {
  const application = await getApplication(applicationId)
  assert(application, 404, 'Application not found')
  assert(
    !application.approved_at && !application.rejected_at,
    422,
    'Application has already been reviewed',
  )

  const [community, membership] = await Promise.all([
    getCommunity(application.community_id),
    getCommunityMember(application.community_id, currentUser.id),
  ])
  assert(community, 404, 'Community not found')
  assert(!community.archived_at, 409, 'Archived communities cannot be updated')
  assert(currentUserCanModerateCommunity(currentUser, community, membership), 403, 'Forbidden')

  if (reason) {
    assert(reason.trim() === reason, 422, 'Reason must not have leading or trailing whitespace')
    assert(reason.length <= 1000, 422, 'Reason must be at most 1000 characters')
  }

  await using query = await beginTransaction()

  const options = { query }
  const { rowCount: rejectedRowCount } = await write(
    sql`/* rejectApplication */
    UPDATE community_applications
    SET reviewed_at = CURRENT_TIMESTAMP,
        reviewed_by_id = ${currentUser.id},
        rejected_at = CURRENT_TIMESTAMP,
        rejection_reason = ${reason ?? null}
    WHERE id = ${applicationId}
      AND approved_at IS NULL
      AND rejected_at IS NULL
      `,
    options,
  )
  const notification =
    (rejectedRowCount ?? 0) === 0
      ? null
      : await createCommunityLifecycleNotification(
          {
            userId: application.user_id,
            communityId: application.community_id,
            entityType: 'community_application_decision',
            eventKey: `community-application-decision:${applicationId}`,
            title: `Your application to ${community.name} was not approved`,
            body: reason
              ? `Reason: ${reason}`
              : `Your application to ${community.name} was not approved.`,
          },
          options,
        )

  await query.commit()
  if (notification) await enqueueCommunityLifecycleNotificationPush([notification])
  const wasRejected = notification !== null
  if (wasRejected) {
    await recordModeratorAction(currentUser.id, {
      actionType: 'reject',
      communityId: application.community_id,
      communityApplicationId: applicationId,
      targetUserId: application.user_id,
      reason: reason ?? null,
    })

    const applicant = await getPrivateUserByAny(application.user_id)
    if (applicant) {
      void enqueueSendCommunityApplicationDecisionEmail(
        {
          userId: applicant.id,
          uiLocale: applicant.ui_locale ?? null,
        },
        {
          communityName: community.name,
          communityUrl: getSiteUrl(`/communities/${community.slug}`),
          status: 'rejected',
          rejectionReason: reason ?? undefined,
        },
      )
    }
  }
}
