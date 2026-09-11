import { it, expect, beforeAll, describe } from 'vitest'
import {
  createTestUser,
  createTestUserDirect,
  insertTestCommunity,
  insertTestCommunityMember,
  readAllQueueJobs,
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
      const app = await createApplication(applicant.id, community.id, {})

      await approveApplication(owner, app.id)

      const updated = await getApplication(app.id)
      expect(updated?.approved_at).not.toBeNull()
      expect(updated?.rejected_at).toBeNull()

      const membership = await getCommunityMember(community.id, applicant.id)
      expect(membership).not.toBeNull()
      const response = await listNotifications(applicant.id)
      expect(Object.values(response.notifications)).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            entity_type: 'community_application_decision',
            title: `Your application to ${community.name} was approved`,
          }),
        ]),
      )
    })

    it('rejects re-reviewing an already reviewed application', async () => {
      const applicant = await createTestUser()
      const community = await createPrivateCommunityOwnedBy(owner.id)
      const app = await createApplication(applicant.id, community.id, {})
      await approveApplication(owner, app.id)
      await expect(approveApplication(owner, app.id)).rejects.toMatchObject({ status: 422 })
    })

    it('queues an approval decision email when the applicant has an email address', async () => {
      const applicant = await createTestUser()
      const community = await createPrivateCommunityOwnedBy(owner.id)
      const app = await createApplication(applicant.id, community.id, {})

      await approveApplication(owner, app.id)

      await expect
        .poll(async () => {
          const jobs = await readAllQueueJobs(emails)
          return jobs.some(job => {
            const data = job.data as {
              input?: { emailAddress?: string; userId?: string }
              variables?: { communityName?: string; communityUrl?: string; status?: string }
            }
            return (
              job.name === 'processSendCommunityApplicationDecisionEmail' &&
              data.input?.userId === applicant.id &&
              data.input?.emailAddress === undefined &&
              data.variables?.communityName === community.name &&
              data.variables?.communityUrl === getSiteUrl(`/communities/${community.slug}`) &&
              data.variables?.status === 'approved'
            )
          })
        })
        .toBe(true)
    })

    it('queues a user-targeted decision email when the approved applicant has no email address', async () => {
      const applicant = await createTestUserDirect()
      const community = await createPrivateCommunityOwnedBy(owner.id)
      const app = await createApplication(applicant.id, community.id, {})

      await approveApplication(owner, app.id)

      await expect
        .poll(async () => {
          const jobs = await readAllQueueJobs(emails)
          return jobs.some(job => {
            const data = job.data as { input?: { emailAddress?: string; userId?: string } }
            return (
              job.name === 'processSendCommunityApplicationDecisionEmail' &&
              data.input?.userId === applicant.id &&
              data.input?.emailAddress === undefined
            )
          })
        })
        .toBe(true)
    })
  })

  describe('rejectApplication', () => {
    it('owner can reject an application with a reason', async () => {
      const applicant = await createTestUser()
      const community = await createPrivateCommunityOwnedBy(owner.id)
      const app = await createApplication(applicant.id, community.id, {})

      await rejectApplication(owner, app.id, 'Not a good fit')

      const updated = await getApplication(app.id)
      expect(updated?.rejected_at).not.toBeNull()
      expect(updated?.rejection_reason).toBe('Not a good fit')
      expect(updated?.approved_at).toBeNull()
      const response = await listNotifications(applicant.id)
      expect(Object.values(response.notifications)).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            entity_type: 'community_application_decision',
            title: `Your application to ${community.name} was not approved`,
            body: 'Reason: Not a good fit',
          }),
        ]),
      )
    })

    it('non-member cannot reject application', async () => {
      const applicant = await createTestUser()
      const stranger = await createTestUser()
      const community = await createPrivateCommunityOwnedBy(owner.id)
      const app = await createApplication(applicant.id, community.id, {})
      await expect(rejectApplication(stranger, app.id)).rejects.toMatchObject({ status: 403 })
    })

    it('queues a rejection decision email with the reason when the applicant has an email address', async () => {
      const applicant = await createTestUser()
      const community = await createPrivateCommunityOwnedBy(owner.id)
      const app = await createApplication(applicant.id, community.id, {})

      await rejectApplication(owner, app.id, 'Not a good fit')

      await expect
        .poll(async () => {
          const jobs = await readAllQueueJobs(emails)
          return jobs.some(job => {
            const data = job.data as {
              input?: { emailAddress?: string; userId?: string }
              variables?: { status?: string; rejectionReason?: string }
            }
            return (
              job.name === 'processSendCommunityApplicationDecisionEmail' &&
              data.input?.userId === applicant.id &&
              data.input?.emailAddress === undefined &&
              data.variables?.status === 'rejected' &&
              data.variables?.rejectionReason === 'Not a good fit'
            )
          })
        })
        .toBe(true)
    })

    it('uses the no-reason copy and queues a user-targeted rejection email', async () => {
      const applicant = await createTestUserDirect()
      const community = await createPrivateCommunityOwnedBy(owner.id)
      const app = await createApplication(applicant.id, community.id, {})

      await rejectApplication(owner, app.id)

      expect(Object.values((await listNotifications(applicant.id)).notifications)).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            entity_type: 'community_application_decision',
            title: `Your application to ${community.name} was not approved`,
            body: `Your application to ${community.name} was not approved.`,
          }),
        ]),
      )

      await expect
        .poll(async () => {
          const jobs = await readAllQueueJobs(emails)
          return jobs.some(job => {
            const data = job.data as { input?: { emailAddress?: string; userId?: string } }
            return (
              job.name === 'processSendCommunityApplicationDecisionEmail' &&
              data.input?.userId === applicant.id &&
              data.input?.emailAddress === undefined
            )
          })
        })
        .toBe(true)
    })
  })
})
