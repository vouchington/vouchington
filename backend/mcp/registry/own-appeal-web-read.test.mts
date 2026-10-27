import { createRequest } from '@voucha/test-helpers/api/server'
import {
  optionArgs,
  callStructuredMcpTool,
  callRejectedMcpTool,
} from '@voucha/test-helpers/mcp-tool-contract'
import {
  createTestUser,
  insertTestModerationAppeal,
  suspendTestUserGetId,
  unsuspendTestUser,
  insertTestUserWarning,
  resolveTestModerationAppeal,
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
  it('hides physically retained expired history from both member readers while staff can still inspect it', async () => {
    const caller = { ...(await createTestUser()), membership_plan: null }
    const staff = await createTestUser({ administrator: true })
    const warning = await insertTestUserWarning({ userId: caller.id, issuedById: staff.id })
    const appeal = await insertTestModerationAppeal({
      appellantId: caller.id,
      userWarningId: warning.id,
    })
    const resolvedAt = new Date()
    resolvedAt.setUTCFullYear(resolvedAt.getUTCFullYear() - 3)
    await resolveTestModerationAppeal({ appealId: appeal.id, resolvedAt, resolutionAction: 'deny' })
    const memberRequest = createRequest()
    await memberRequest.authenticateAs(caller)
    await memberRequest.get(`/api/v1/appeals/${appeal.id}`).expect(404)
    const error = JSON.parse(
      await callRejectedMcpTool(
        caller,
        'read_my_moderation_appeals',
        optionArgs('get', { appeal_id: appeal.id }),
        ['appeals:read'],
      ),
    )
    expect(error).toMatchObject({ error: { status: 404, code: 'NOT_FOUND' } })
    const staffRequest = createRequest()
    await staffRequest.authenticateAs(staff)
    const response = await staffRequest.get(`/api/v1/appeals/${appeal.id}`).expect(200)
    expect(response.body.appeal.id).toBe(appeal.id)
  })

  it('keeps a current resolved appeal readable through the member MCP reader', async () => {
    const caller = { ...(await createTestUser()), membership_plan: null }
    const warning = await insertTestUserWarning({ userId: caller.id, issuedById: caller.id })
    const appeal = await insertTestModerationAppeal({
      appellantId: caller.id,
      userWarningId: warning.id,
    })
    await resolveTestModerationAppeal({
      appealId: appeal.id,
      resolvedAt: new Date(),
      resolutionAction: 'deny',
    })
    const result = await callStructuredMcpTool(
      caller,
      'read_my_moderation_appeals',
      optionArgs('get', { appeal_id: appeal.id }),
      ['appeals:read'],
    )
    expect(result.appeal).toMatchObject({ id: appeal.id })
  })
})
