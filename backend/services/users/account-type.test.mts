import { describe, expect, it } from 'vitest'
import { getPublicUserByAny, getPrivateUserByAny } from '@services/users'
import { addUserRole } from '@services/users/roles-permissions'
import { getActiveAgentsByType } from '@services/agents/get'
import {
  createAccountTypeTestUser,
  createAccountTypeTestAgent,
  setAccountTypeTestUserKind,
  getInvalidPlatformAccountCounts,
  getSeededAccountKinds,
} from '@voucha/test-helpers/account-types'

describe('account type storage and public projection', () => {
  it.each([
    { kind: 'official', role: undefined, agent: false, expected: 'official' },
    { kind: 'system', role: undefined, agent: false, expected: 'system' },
    { kind: 'system', role: undefined, agent: true, expected: 'ai_agent' },
    { kind: null, role: 'administrator', agent: false, expected: 'official' },
    { kind: null, role: 'investor', agent: false, expected: 'official' },
    { kind: null, role: undefined, agent: false, expected: null },
  ] as const)(
    'derives $expected from $kind, $role and agent=$agent',
    async ({ kind, role, agent, expected }) => {
      const user = await createAccountTypeTestUser(kind, role)
      if (agent) await createAccountTypeTestAgent(user.id)
      expect((await getPublicUserByAny(user.id))?.account_type).toBe(expected)
      expect((await getPrivateUserByAny(user.id))?.account_type).toBe(expected)
    },
  )

  it('keeps active classifiers out of moderator dispatch', async () => {
    const user = await createAccountTypeTestUser('system')
    const agentId = await createAccountTypeTestAgent(user.id, false, true)
    expect((await getPublicUserByAny(user.id))?.account_type).toBe('ai_agent')
    expect((await getActiveAgentsByType('moderator')).map(agent => agent.id)).not.toContain(agentId)
  })

  it('labels an account with only a deleted agent as System', async () => {
    const user = await createAccountTypeTestUser('system')
    await createAccountTypeTestAgent(user.id, true)
    expect((await getPublicUserByAny(user.id))?.account_type).toBe('system')
  })

  it.each(['official', null] as const)('rejects agents on %s accounts', async kind => {
    const user = await createAccountTypeTestUser(kind)
    await expect(createAccountTypeTestAgent(user.id)).rejects.toMatchObject({ code: '23514' })
  })

  it('rejects role grants and incompatible account-kind changes', async () => {
    const system = await createAccountTypeTestUser('system')
    await expect(addUserRole(system.id, 'moderator')).rejects.toMatchObject({ status: 403 })
    const official = await createAccountTypeTestUser('official', 'administrator')
    await expect(setAccountTypeTestUserKind(official.id, 'system')).rejects.toMatchObject({
      code: '23514',
    })
    await createAccountTypeTestAgent(system.id)
    await expect(setAccountTypeTestUserKind(system.id, 'official')).rejects.toMatchObject({
      code: '23514',
    })
    expect(await getInvalidPlatformAccountCounts()).toEqual({
      system_roles: 0,
      non_system_agents: 0,
    })
  })

  it('seeds reserved people and six classifiers with mutually exclusive account kinds', async () => {
    const rows = await getSeededAccountKinds()
    for (const username of ['jong', 'voucha']) {
      expect(rows.find(row => row.username === username)?.platform_account_kind).toBe('official')
    }
    for (const username of [
      'post-classifier',
      'autotagger-classifier',
      'story-clustering-classifier',
      'rss-feed-categorizer',
      'rss-feed-collaborative-categorizer',
      'automod',
    ]) {
      expect(rows.find(row => row.username === username)).toMatchObject({
        platform_account_kind: 'system',
        agent_type: 'classifier',
      })
    }
    expect(rows.find(row => row.username === 'deleted')?.platform_account_kind).toBeNull()
    expect(await getInvalidPlatformAccountCounts()).toEqual({
      system_roles: 0,
      non_system_agents: 0,
    })
  })
})
