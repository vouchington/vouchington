import { it, expect, describe } from 'vitest'
import {
  createTestUser,
  createTestUserDirect,
  insertTestCommunity,
  insertTestCommunityMember,
  readAllQueueJobs,
} from '@voucha/test-helpers'
import { archiveCommunity } from './archive.mts'
import { getCommunityMember } from './members/get.mts'
import { initiateOwnershipTransfer } from './ownership-transfer.mts'
import { emails } from '@queues/emails/queues'

describe('initiateOwnershipTransfer', () => {
  it('owner can transfer to an eligible moderator and roles swap', async () => {
    const owner = await createTestUser()
    const moderator = await createTestUser()
    const ts = Date.now()

    const community = await insertTestCommunity({
      createdById: owner.id,
      slug: `initiate-transfer-ok-${ts}`,
    })
    await Promise.all([
      insertTestCommunityMember({ communityId: community.id, userId: owner.id, role: 'owner' }),
      insertTestCommunityMember({
        communityId: community.id,
        userId: moderator.id,
        role: 'moderator',
      }),
    ])

    await initiateOwnershipTransfer(owner.id, community.id, moderator.id)

    const ownerAfter = await getCommunityMember(community.id, owner.id)
    expect(ownerAfter?.role).toBe('moderator')

    const moderatorAfter = await getCommunityMember(community.id, moderator.id)
    expect(moderatorAfter?.role).toBe('owner')
  })

  it('fails with 422 if target is not a moderator', async () => {
    const owner = await createTestUser()
    const regularMember = await createTestUser()
    const ts = Date.now()

    const community = await insertTestCommunity({
      createdById: owner.id,
      slug: `initiate-transfer-not-mod-${ts}`,
    })
    await Promise.all([
      insertTestCommunityMember({ communityId: community.id, userId: owner.id, role: 'owner' }),
      insertTestCommunityMember({
        communityId: community.id,
        userId: regularMember.id,
        role: 'member',
      }),
    ])

    await expect(
      initiateOwnershipTransfer(owner.id, community.id, regularMember.id),
    ).rejects.toMatchObject({ status: 422 })
  })

  it('fails with 403 if current user is not the owner', async () => {
    const owner = await createTestUser()
    const nonOwner = await createTestUser()
    const moderator = await createTestUser()
    const ts = Date.now()

    const community = await insertTestCommunity({
      createdById: owner.id,
      slug: `initiate-transfer-403-${ts}`,
    })
    await Promise.all([
      insertTestCommunityMember({ communityId: community.id, userId: owner.id, role: 'owner' }),
      insertTestCommunityMember({ communityId: community.id, userId: nonOwner.id, role: 'member' }),
      insertTestCommunityMember({
        communityId: community.id,
        userId: moderator.id,
        role: 'moderator',
      }),
    ])

    await expect(
      initiateOwnershipTransfer(nonOwner.id, community.id, moderator.id),
    ).rejects.toMatchObject({ status: 403 })
  })

  it('fails with 403 for archived communities', async () => {
    const owner = await createTestUser()
    const moderator = await createTestUser()
    const ts = Date.now()

    const community = await insertTestCommunity({
      createdById: owner.id,
      slug: `initiate-transfer-archived-${ts}`,
    })
    await Promise.all([
      insertTestCommunityMember({ communityId: community.id, userId: owner.id, role: 'owner' }),
      insertTestCommunityMember({
        communityId: community.id,
        userId: moderator.id,
        role: 'moderator',
      }),
    ])

    await archiveCommunity(community.id, owner.id)

    await expect(
      initiateOwnershipTransfer(owner.id, community.id, moderator.id),
    ).rejects.toMatchObject({ status: 403, message: 'Community is archived' })
  })

  it('transfers ownership regardless of target community ownership count', async () => {
    const owner = await createTestUser()
    const moderator = await createTestUser()
    const ts = Date.now()

    // Moderator already owns 2 communities — no limits apply
    const owned1 = await insertTestCommunity({
      createdById: moderator.id,
      slug: `transfer-mod-own1-${ts}`,
    })
    const owned2 = await insertTestCommunity({
      createdById: moderator.id,
      slug: `transfer-mod-own2-${ts}`,
    })
    await Promise.all([
      insertTestCommunityMember({ communityId: owned1.id, userId: moderator.id, role: 'owner' }),
      insertTestCommunityMember({ communityId: owned2.id, userId: moderator.id, role: 'owner' }),
    ])

    const community = await insertTestCommunity({
      createdById: owner.id,
      slug: `transfer-free-no-limit-${ts}`,
    })
    await Promise.all([
      insertTestCommunityMember({ communityId: community.id, userId: owner.id, role: 'owner' }),
      insertTestCommunityMember({
        communityId: community.id,
        userId: moderator.id,
        role: 'moderator',
      }),
    ])

    await initiateOwnershipTransfer(owner.id, community.id, moderator.id)

    const moderatorAfter = await getCommunityMember(community.id, moderator.id)
    expect(moderatorAfter?.role).toBe('owner')
  })

  it('queues ownership-transfer emails to both the new owner and the previous owner when both have email addresses', async () => {
    const owner = await createTestUser()
    const moderator = await createTestUser()
    const ts = Date.now()

    const community = await insertTestCommunity({
      createdById: owner.id,
      slug: `initiate-transfer-emails-${ts}`,
    })
    await Promise.all([
      insertTestCommunityMember({ communityId: community.id, userId: owner.id, role: 'owner' }),
      insertTestCommunityMember({
        communityId: community.id,
        userId: moderator.id,
        role: 'moderator',
      }),
    ])

    await initiateOwnershipTransfer(owner.id, community.id, moderator.id)

    await expect
      .poll(async () => {
        const jobs = await readAllQueueJobs(emails)
        const isOwnershipTransferJobFor = (userId: string, recipientRole: string) =>
          jobs.some(job => {
            const data = job.data as {
              input?: { userId?: string }
              variables?: { recipientRole?: string }
            }
            return (
              job.name === 'processSendCommunityOwnershipTransferEmail' &&
              data.input?.userId === userId &&
              data.variables?.recipientRole === recipientRole
            )
          })
        return (
          isOwnershipTransferJobFor(moderator.id, 'new_owner') &&
          isOwnershipTransferJobFor(owner.id, 'previous_owner')
        )
      })
      .toBe(true)
  })

  it('queues a user-targeted new-owner email when the new owner has no email address', async () => {
    const owner = await createTestUser()
    const moderator = await createTestUserDirect()
    const ts = Date.now()

    const community = await insertTestCommunity({
      createdById: owner.id,
      slug: `initiate-transfer-no-new-owner-email-${ts}`,
    })
    await Promise.all([
      insertTestCommunityMember({ communityId: community.id, userId: owner.id, role: 'owner' }),
      insertTestCommunityMember({
        communityId: community.id,
        userId: moderator.id,
        role: 'moderator',
      }),
    ])

    await initiateOwnershipTransfer(owner.id, community.id, moderator.id)

    await expect
      .poll(async () => {
        const jobs = await readAllQueueJobs(emails)
        return jobs.some(job => {
          const data = job.data as {
            input?: { userId?: string }
            variables?: { recipientRole?: string }
          }
          return (
            job.name === 'processSendCommunityOwnershipTransferEmail' &&
            data.input?.userId === moderator.id &&
            data.variables?.recipientRole === 'new_owner'
          )
        })
      })
      .toBe(true)
  })

  it('queues a user-targeted previous-owner email when the previous owner has no email address', async () => {
    const owner = await createTestUserDirect()
    const moderator = await createTestUser()
    const ts = Date.now()

    const community = await insertTestCommunity({
      createdById: owner.id,
      slug: `initiate-transfer-no-prev-owner-email-${ts}`,
    })
    await Promise.all([
      insertTestCommunityMember({ communityId: community.id, userId: owner.id, role: 'owner' }),
      insertTestCommunityMember({
        communityId: community.id,
        userId: moderator.id,
        role: 'moderator',
      }),
    ])

    await initiateOwnershipTransfer(owner.id, community.id, moderator.id)

    await expect
      .poll(async () => {
        const jobs = await readAllQueueJobs(emails)
        return jobs.some(job => {
          const data = job.data as {
            input?: { userId?: string }
            variables?: { recipientRole?: string }
          }
          return (
            job.name === 'processSendCommunityOwnershipTransferEmail' &&
            data.input?.userId === owner.id &&
            data.variables?.recipientRole === 'previous_owner'
          )
        })
      })
      .toBe(true)
  })
})
