import { optionArgs, callStructuredMcpTool } from '@voucha/test-helpers/mcp-tool-contract'
import {
  createTestUser,
  insertTestModerationAppeal,
  suspendTestUserGetId,
  unsuspendTestUser,
} from '@voucha/test-helpers'
import { describe, expect, it } from 'vitest'

describe('read_my_moderation_appeals.get — appeal filed on the web', () => {
  it('names an account suspension as the target of an appeal filed on the web', async () => {
    const caller = { ...(await createTestUser()), membership_plan: null }
    const suspensionId = await suspendTestUserGetId(caller.id, 'Suspension for the read test')
    const appeal = await insertTestModerationAppeal({
      appellantId: caller.id,
      userSuspensionId: suspensionId,
    })
    await unsuspendTestUser(caller.id)

    const result = await callStructuredMcpTool(
      caller,
      'read_my_moderation_appeals',
      optionArgs('get', { appeal_id: appeal.id }),
      ['appeals:read'],
    )

    expect(result.appeal).toMatchObject({
      id: appeal.id,
      target_type: 'suspension',
      target_id: suspensionId,
    })
  })
})
