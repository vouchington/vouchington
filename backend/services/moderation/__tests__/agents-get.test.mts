import { beforeAll, describe, expect, it } from 'vitest'
import { createTestUserDirect } from '@voucha/test-helpers'
import { createPostLLMModerator, updatePostLLMModerator } from '../moderators.mts'
import {
  getActiveAgentsByType,
  getAgentBySystemUserId,
  getAgentModeratorConfig,
} from '@services/agents/get'

describe('get', () => {
  let ownerUser: Awaited<ReturnType<typeof createTestUserDirect>> | null = null
  let systemUserOne: Awaited<ReturnType<typeof createTestUserDirect>> | null = null
  let systemUserTwo: Awaited<ReturnType<typeof createTestUserDirect>> | null = null
  let activeModeratorId: string | null = null
  let inactiveModeratorId: string | null = null

  beforeAll(async () => {
    ownerUser = await createTestUserDirect()
    systemUserOne = await createTestUserDirect()
    systemUserTwo = await createTestUserDirect()
    const random = Math.random().toString(36).slice(2, 8)

    const activeModerator = await createPostLLMModerator(
      ownerUser!,
      systemUserOne!,
      `agents-get-active-${random}`,
    )
    activeModeratorId = activeModerator.id
    const inactiveModerator = await createPostLLMModerator(
      ownerUser!,
      systemUserTwo!,
      `agents-get-inactive-${random}`,
    )
    inactiveModeratorId = inactiveModerator.id
    await updatePostLLMModerator(ownerUser!, activeModerator.id, { active: true })
    await updatePostLLMModerator(ownerUser!, inactiveModerator.id, { active: false })
  })
  describe('agents/get', () => {
    it('getAgentBySystemUserId returns null for unknown user', async () => {
      const result = await getAgentBySystemUserId('00000000-0000-0000-0000-000000000000')
      expect(result).toBeNull()
    })

    it('getAgentBySystemUserId returns agent for known system user', async () => {
      const result = await getAgentBySystemUserId(systemUserOne!.id)
      expect(result?.id).toBe(activeModeratorId)
      expect(result?.system_user_id).toBe(systemUserOne!.id)
    })

    it('getActiveAgentsByType returns only active agents of the type', async () => {
      const moderators = await getActiveAgentsByType('moderator')
      const ids = new Set(moderators.map(agent => agent.id))

      expect(ids.has(activeModeratorId!)).toBe(true)
      expect(ids.has(inactiveModeratorId!)).toBe(false)
    })

    it('getAgentModeratorConfig returns config row for existing moderator', async () => {
      const config = await getAgentModeratorConfig(activeModeratorId!)

      expect(config).not.toBeNull()
      expect(config?.agent_id).toBe(activeModeratorId)
    })

    it('getAgentModeratorConfig returns null when missing', async () => {
      const config = await getAgentModeratorConfig('00000000-0000-0000-0000-000000000000')
      expect(config).toBeNull()
    })
  })
})
