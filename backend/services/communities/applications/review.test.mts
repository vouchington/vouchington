import { it, expect, beforeAll, describe } from 'vitest'
import {
  createTestUser,
  createTestUserDirect,
  insertTestCommunity,
  insertTestCommunityMember,
  readEnqueuedJob,
  WEB_PROVENANCE,
  insertTestCommunityInvite,
  getTestCommunityInviteStorage,
} from '@voucha/test-helpers'
import { createApplication } from './create.mts'
import { approveApplication, rejectApplication } from './review.mts'
import { getApplication } from './get.mts'
import { getCommunityMember } from '../members/get.mts'
import { emails } from '@queues/emails/queues'
import { getSiteUrl } from '@modules/utils'
import type { PrivateUser } from '@services/users/types'
import type { Community } from '../types.mts'
import { listNotifications } from '@services/notifications/list'
import { renderListedNotification } from '../../../test-helpers/services/notifications/render-listed-notification.mts'

/** The English text of the one notification of a kind in a listed page. */
function renderedOfKind(page: Awaited<ReturnType<typeof listNotifications>>, kind: string) {
  const found = Object.values(page.notifications).find(item => item.kind === kind)
  if (!found) throw new Error(`Expected a ${kind} notification`)
  return renderListedNotification(page, found.id)
}

describe('review', () => {
  let owner: PrivateUser

  beforeAll(async () => {
    owner = await createTestUser()
  })

  async function createPrivateCommunityOwnedBy(ownerId: string): Promise<Community> {
    const community = await insertTestCommunity({ createdById: ownerId, visibility: 'private' })
    await insertTestCommunityMember({ communityId: community.id, userId: ownerId, role: 'owner' })
    return community
  }

  describe('approveApplication', () => {
    it('owner can approve and applicant becomes member', async () => {
      const applicant = await createTestUser()
      const community = await createPrivateCommunityOwnedBy(owner.id)
      const app = await createApplication(applicant.id, WEB_PROVENANCE, community.id, {})

      await approveApplication(owner, app.id)

      const updated = await getApplication(app.id)
      expect(updated?.approved_at).not.toBeNull()
      expect(updated?.rejected_at).toBeNull()

      const membership = await getCommunityMember(community.id, applicant.id)
      expect(membership).not.toBeNull()
      expect(
        renderedOfKind(await listNotifications(applicant.id), 'community_application_approved')
          .title,
      ).toBe(`Your application to ${community.name} was approved`)
    })

    it('approving an application removes the applicant’s pending invites', async () => {
      const applicant = await createTestUser()
      const community = await createPrivateCommunityOwnedBy(owner.id)
      const app = await createApplication(applicant.id, WEB_PROVENANCE, community.id, {})
      const invite = await insertTestCommunityInvite({
        communityId: community.id,
        invitedById: owner.id,
        invitedEmail: applicant.email_address!,
      })

      await approveApplication(owner, app.id)

      expect(await getTestCommunityInviteStorage(invite.id)).toBeNull()
    })

    it('rejects re-reviewing an already reviewed application', async () => {
      const applicant = await createTestUser()
      const community = await createPrivateCommunityOwnedBy(owner.id)
      const app = await createApplication(applicant.id, WEB_PROVENANCE, community.id, {})
      await approveApplication(owner, app.id)
      await expect(approveApplication(owner, app.id)).rejects.toMatchObject({ status: 422 })
    })

    it('queues an approval decision email when the applicant has an email address', async () => {
      const applicant = await createTestUser()
      const community = await createPrivateCommunityOwnedBy(owner.id)
      const app = await createApplication(applicant.id, WEB_PROVENANCE, community.id, {})

      const { decisionEmailEnqueue } = await approveApplication(owner, app.id)
      expect(decisionEmailEnqueue).not.toBeNull()
      const job = await readEnqueuedJob(emails, await decisionEmailEnqueue)
      const data = job.data as {
        input?: { emailAddress?: string; userId?: string }
        variables?: { communityName?: string; communityUrl?: string; status?: string }
      }
      expect(
        job.name === 'processSendCommunityApplicationDecisionEmail' &&
          data.input?.userId === applicant.id &&
          data.input?.emailAddress === undefined &&
          data.variables?.communityName === community.name &&
          data.variables?.communityUrl === getSiteUrl(`/communities/${community.slug}`) &&
          data.variables?.status === 'approved',
      ).toBe(true)
    })

    it('queues a user-targeted decision email when the approved applicant has no email address', async () => {
      const applicant = await createTestUserDirect()
      const community = await createPrivateCommunityOwnedBy(owner.id)
      const app = await createApplication(applicant.id, WEB_PROVENANCE, community.id, {})

      const { decisionEmailEnqueue } = await approveApplication(owner, app.id)
      expect(decisionEmailEnqueue).not.toBeNull()
      const job = await readEnqueuedJob(emails, await decisionEmailEnqueue)
      const data = job.data as { input?: { emailAddress?: string; userId?: string } }
      expect(
        job.name === 'processSendCommunityApplicationDecisionEmail' &&
          data.input?.userId === applicant.id &&
          data.input?.emailAddress === undefined,
      ).toBe(true)
    })
  })

  describe('rejectApplication', () => {
    it('owner can reject an application with a reason', async () => {
      const applicant = await createTestUser()
      const community = await createPrivateCommunityOwnedBy(owner.id)
      const app = await createApplication(applicant.id, WEB_PROVENANCE, community.id, {})

      await rejectApplication(owner, app.id, 'Not a good fit')

      const updated = await getApplication(app.id)
      expect(updated?.rejected_at).not.toBeNull()
      expect(updated?.rejection_reason).toBe('Not a good fit')
      expect(updated?.approved_at).toBeNull()
      expect(
        renderedOfKind(await listNotifications(applicant.id), 'community_application_rejected'),
      ).toEqual({
        title: `Your application to ${community.name} was not approved`,
        body: 'Reason: Not a good fit',
      })
    })

    it('non-member cannot reject application', async () => {
      const applicant = await createTestUser()
      const stranger = await createTestUser()
      const community = await createPrivateCommunityOwnedBy(owner.id)
      const app = await createApplication(applicant.id, WEB_PROVENANCE, community.id, {})
      await expect(rejectApplication(stranger, app.id)).rejects.toMatchObject({ status: 403 })
    })

    it('queues a rejection decision email with the reason when the applicant has an email address', async () => {
      const applicant = await createTestUser()
      const community = await createPrivateCommunityOwnedBy(owner.id)
      const app = await createApplication(applicant.id, WEB_PROVENANCE, community.id, {})

      const { decisionEmailEnqueue } = await rejectApplication(owner, app.id, 'Not a good fit')
      expect(decisionEmailEnqueue).not.toBeNull()
      const job = await readEnqueuedJob(emails, await decisionEmailEnqueue)
      const data = job.data as {
        input?: { emailAddress?: string; userId?: string }
        variables?: { status?: string; rejectionReason?: string }
      }
      expect(
        job.name === 'processSendCommunityApplicationDecisionEmail' &&
          data.input?.userId === applicant.id &&
          data.input?.emailAddress === undefined &&
          data.variables?.status === 'rejected' &&
          data.variables?.rejectionReason === 'Not a good fit',
      ).toBe(true)
    })

    it('uses the no-reason copy and queues a user-targeted rejection email', async () => {
      const applicant = await createTestUserDirect()
      const community = await createPrivateCommunityOwnedBy(owner.id)
      const app = await createApplication(applicant.id, WEB_PROVENANCE, community.id, {})

      const { decisionEmailEnqueue } = await rejectApplication(owner, app.id)

      expect(
        renderedOfKind(await listNotifications(applicant.id), 'community_application_rejected'),
      ).toEqual({
        title: `Your application to ${community.name} was not approved`,
        body: `Your application to ${community.name} was not approved.`,
      })

      expect(decisionEmailEnqueue).not.toBeNull()
      const job = await readEnqueuedJob(emails, await decisionEmailEnqueue)
      const data = job.data as { input?: { emailAddress?: string; userId?: string } }
      expect(
        job.name === 'processSendCommunityApplicationDecisionEmail' &&
          data.input?.userId === applicant.id &&
          data.input?.emailAddress === undefined,
      ).toBe(true)
    })
  })
})
