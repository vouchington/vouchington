import { describe, expect, it } from 'vitest'
import {
  createTestUser,
  insertTestCommunity,
  insertTestCommunityMember,
} from '@voucha/test-helpers'
import { holdQueueAdmission } from '@voucha/test-helpers/queue-admission-hold'
import { background } from '@queues/background/queues'
import { removeMember } from '../members/remove.mts'
import { updateMemberRole } from '../members/update-role.mts'
import { banUserFromCommunity } from '../bans/create.mts'
import { getCommunityMember } from '../members/get.mts'

describe('community prompt cleanup admission', () => {
  it.each(['remove', 'demote', 'ban'] as const)(
    '%s commits membership before awaiting prompt cleanup admission',
    async action => {
      const owner = await createTestUser()
      const target = await createTestUser()
      const community = await insertTestCommunity({ createdById: owner.id, visibility: 'public' })
      await insertTestCommunityMember({
        communityId: community.id,
        userId: owner.id,
        role: 'owner',
      })
      await insertTestCommunityMember({
        communityId: community.id,
        userId: target.id,
        role: 'moderator',
      })
      const gate = holdQueueAdmission(
        background,
        'entity-listeners.processCommunityAgentPromptsDeactivated',
        data =>
          typeof data === 'object' &&
          data !== null &&
          'userId' in data &&
          data.userId === target.id,
      )
      let settled = false
      const mutation = (
        action === 'remove'
          ? removeMember(owner.id, community, target.id)
          : action === 'demote'
            ? updateMemberRole(owner.id, community, target.id, 'member')
            : banUserFromCommunity(owner, community.id, target.id)
      ).then(result => {
        settled = true
        return result
      })
      void mutation.catch(() => undefined)
      try {
        await gate.entered
        const membership = await getCommunityMember(community.id, target.id)
        expect(membership?.role ?? null).toBe(action === 'demote' ? 'member' : null)
        expect(settled).toBe(false)
        gate.release()
        await mutation
        expect(await gate.admitted).not.toBeNull()
      } finally {
        gate.release()
        await mutation.catch(() => undefined)
        await (await gate.admitted.catch(() => null))?.remove()
        gate.restore()
      }
    },
  )
})
