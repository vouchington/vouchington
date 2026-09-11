import { it, expect, describe, beforeAll } from 'vitest'
import {
  createTestUser,
  insertTestCommunity,
  insertTestCommunityAgentPrompt,
  insertTestCommunityMember,
  type TestCommunityAgentPrompt,
} from '@voucha/test-helpers'
import { archiveCommunity } from '@services/communities/archive'
import { updateCommunityAgentPrompt } from './update.mts'
import type { PrivateUser } from '@services/users/types'
import type { Community } from '@services/communities/types'

describe('update', () => {
  let user: PrivateUser
  let other: PrivateUser
  let community: Community
  let prompt: TestCommunityAgentPrompt

  beforeAll(async () => {
    ;[user, other] = await Promise.all([createTestUser(), createTestUser()])
    community = await insertTestCommunity({ createdById: user.id })
    await insertTestCommunityMember({ communityId: community.id, userId: user.id, role: 'owner' })
    prompt = await insertTestCommunityAgentPrompt({
      communityId: community.id,
      createdById: user.id,
      prompt: 'Original prompt text',
    })
  })

  describe('updateCommunityAgentPrompt', () => {
    it('updates prompt text', async () => {
      const p = await insertTestCommunityAgentPrompt({
        communityId: community.id,
        createdById: user.id,
        prompt: 'Before',
      })
      const updated = await updateCommunityAgentPrompt(user, p.id, { prompt: 'After' })
      expect(updated.prompt).toBe('After')
      expect(updated.id).toBe(p.id)
    })

    it('trims whitespace from updated prompt', async () => {
      const p = await insertTestCommunityAgentPrompt({
        communityId: community.id,
        createdById: user.id,
      })
      const updated = await updateCommunityAgentPrompt(user, p.id, { prompt: '  trimmed  ' })
      expect(updated.prompt).toBe('trimmed')
    })

    it('no-op update (no fields) preserves existing prompt', async () => {
      const p = await insertTestCommunityAgentPrompt({
        communityId: community.id,
        createdById: user.id,
        prompt: 'Unchanged',
      })
      const updated = await updateCommunityAgentPrompt(user, p.id, {})
      expect(updated.prompt).toBe('Unchanged')
    })

    it('rejects update by non-creator', async () => {
      await expect(
        updateCommunityAgentPrompt(other, prompt.id, { prompt: 'Hacked' }),
      ).rejects.toMatchObject({ status: 403 })
    })

    it('rejects empty prompt string', async () => {
      await expect(
        updateCommunityAgentPrompt(user, prompt.id, { prompt: '   ' }),
      ).rejects.toMatchObject({ status: 422 })
    })

    it('rejects prompt over 10000 characters', async () => {
      await expect(
        updateCommunityAgentPrompt(user, prompt.id, { prompt: 'x'.repeat(10001) }),
      ).rejects.toMatchObject({ status: 422 })
    })

    it('rejects update to non-existent prompt', async () => {
      await expect(
        updateCommunityAgentPrompt(user, '00000000-0000-0000-0000-000000000000', {
          prompt: 'test',
        }),
      ).rejects.toMatchObject({ status: 404 })
    })

    it('rejects updates in archived communities', async () => {
      const archivedCommunity = await insertTestCommunity({
        createdById: user.id,
        slug: `prompt-update-archived-${Date.now()}`,
      })
      const archivedPrompt = await insertTestCommunityAgentPrompt({
        communityId: archivedCommunity.id,
        createdById: user.id,
        prompt: 'Archived prompt',
      })
      await archiveCommunity(archivedCommunity.id, user.id)

      await expect(
        updateCommunityAgentPrompt(user, archivedPrompt.id, { prompt: 'nope' }),
      ).rejects.toMatchObject({ status: 403, message: 'Community is archived' })
    })
  })
})
