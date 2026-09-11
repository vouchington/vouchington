import { it, expect, describe, beforeAll } from 'vitest'
import { createTestUser, insertTestCommunity } from '@voucha/test-helpers'
import { archiveCommunity } from '@services/communities/archive'
import { createCommunityAgentPrompt } from './create.mts'
import { getCommunityAgentPrompt } from './get.mts'
import type { PrivateUser } from '@services/users/types'
import type { Community } from '@services/communities/types'

describe('create', () => {
  let user: PrivateUser
  let community: Community

  beforeAll(async () => {
    user = await createTestUser()
    community = await insertTestCommunity({ createdById: user.id })
  })

  describe('createCommunityAgentPrompt', () => {
    it('creates a prompt with default model settings', async () => {
      const prompt = await createCommunityAgentPrompt(user.id, community.id, {
        prompt: 'Flag spam content',
      })

      expect(prompt.id).toBeTruthy()
      expect(prompt.community_id).toBe(community.id)
      expect(prompt.created_by_id).toBe(user.id)
      expect(prompt.prompt).toBe('Flag spam content')
      expect(prompt.model_name).toBe('gpt-5.4-nano')
      expect(prompt.model_provider).toBe('openai')
      expect(prompt.slot_allocated).toBe(false)
      expect(prompt.activated_at).toBeNull()
      expect(prompt.deactivated_at).toBeNull()
      expect(prompt.deleted_at).toBeNull()
      expect(prompt.agent_id).toBeTruthy()
    })

    it('trims whitespace from prompt text', async () => {
      const prompt = await createCommunityAgentPrompt(user.id, community.id, {
        prompt: '  flag hate speech  ',
      })
      expect(prompt.prompt).toBe('flag hate speech')
    })

    it('created prompt is retrievable by ID', async () => {
      const created = await createCommunityAgentPrompt(user.id, community.id, {
        prompt: 'Detect off-topic posts',
      })
      const fetched = await getCommunityAgentPrompt(created.id)
      expect(fetched).not.toBeNull()
      expect(fetched!.id).toBe(created.id)
      expect(fetched!.prompt).toBe('Detect off-topic posts')
    })

    it('rejects empty prompt', async () => {
      await expect(
        createCommunityAgentPrompt(user.id, community.id, { prompt: '   ' }),
      ).rejects.toMatchObject({ status: 422 })
    })

    it('rejects prompt over 10000 characters', async () => {
      await expect(
        createCommunityAgentPrompt(user.id, community.id, { prompt: 'a'.repeat(10001) }),
      ).rejects.toMatchObject({ status: 422 })
    })

    it('rejects invalid model_name', async () => {
      await expect(
        createCommunityAgentPrompt(user.id, community.id, {
          prompt: 'valid prompt',
          modelName: 'gpt-bad-model',
        }),
      ).rejects.toMatchObject({ status: 422 })
    })

    it('rejects invalid model_provider', async () => {
      await expect(
        createCommunityAgentPrompt(user.id, community.id, {
          prompt: 'valid prompt',
          modelProvider: 'anthropic',
        }),
      ).rejects.toMatchObject({ status: 422 })
    })

    it('rejects non-existent community', async () => {
      await expect(
        createCommunityAgentPrompt(user.id, '00000000-0000-0000-0000-000000000000', {
          prompt: 'valid prompt',
        }),
      ).rejects.toMatchObject({ status: 404 })
    })

    it('rejects archived community', async () => {
      const archived = await insertTestCommunity({
        createdById: user.id,
        slug: `prompt-create-archived-${Date.now()}`,
      })
      await archiveCommunity(archived.id, user.id)

      await expect(
        createCommunityAgentPrompt(user.id, archived.id, {
          prompt: 'valid prompt',
        }),
      ).rejects.toMatchObject({ status: 403, message: 'Community is archived' })
    })
  })
})
