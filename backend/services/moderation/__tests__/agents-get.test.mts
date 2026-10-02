import { beforeAll, describe, expect, it } from 'vitest'
import { createTestAgent } from '@voucha/test-helpers'
import {
  getActiveAgentsByType,
  getAgentBySystemUserId,
  getAgentModeratorConfig,
} from '@services/agents/get'

describe('get', () => {
  let activeSystemUserId: string | null = null
  let activeModeratorId: string | null = null
  let inactiveModeratorId: string | null = null

  beforeAll(async () => {
    const activeModerator = await createTestAgent({ activated: true })
    activeModeratorId = activeModerator.id
    activeSystemUserId = activeModerator.system_user_id
    inactiveModeratorId = (await createTestAgent({ activated: false })).id
  })
  describe('agents/get', () => {
    it('getAgentBySystemUserId returns null for unknown user', async () => {
      const result = await getAgentBySystemUserId('00000000-0000-0000-0000-000000000000')
      expect(result).toBeNull()
    })

    it('getAgentBySystemUserId returns agent for known system user', async () => {
      const result = await getAgentBySystemUserId(activeSystemUserId!)
      expect(result?.id).toBe(activeModeratorId)
      expect(result?.system_user_id).toBe(activeSystemUserId)
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
