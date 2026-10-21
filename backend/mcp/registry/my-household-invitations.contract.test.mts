import { describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestUser } from '@voucha/test-helpers'
import {
  callRejectedMcpTool,
  callStructuredMcpTool,
  expectMcpToolFunctionThrows,
  optionArgs,
  type McpContractCaller,
} from '@voucha/test-helpers/mcp-tool-contract'

const READ = ['households:read'] as const
const WRITE = ['households:read', 'households:write'] as const
const caller = (
  user: Awaited<ReturnType<typeof createTestUser>>,
  plan: 'plus' | null = null,
): McpContractCaller => ({ ...user, membership_plan: plan })
const read = (user: McpContractCaller, option: string, args: Record<string, unknown>) =>
  callStructuredMcpTool(user, 'read_my_households', optionArgs(option, args), READ)
const write = (user: McpContractCaller, option: string, args: Record<string, unknown>) =>
  callStructuredMcpTool(user, 'manage_my_households', optionArgs(option, args), WRITE)

async function household(request: ReturnType<typeof createRequest>) {
  return (await request.post('/api/v1/households').send({}).expect(201)).body.household.id as string
}

async function invitation(
  request: ReturnType<typeof createRequest>,
  householdId: string,
  userId: string,
) {
  return (
    await request
      .post(`/api/v1/households/${householdId}/invitations`)
      .send({ user: userId, relationship: 'friend' })
      .expect(201)
  ).body.invitation as { id: string }
}

describe('household invitation MCP REST twins — real DB', () => {
  it('lists household and addressed invitations with REST cursors and visibility', async () => {
    const owner = await createTestUser()
    const invitee = await createTestUser()
    const secondInvitee = await createTestUser()
    const stranger = await createTestUser()
    const ownerRequest = createRequest()
    await ownerRequest.authenticateAs(owner)
    const householdId = await household(ownerRequest)
    await invitation(ownerRequest, householdId, invitee.id)
    await invitation(ownerRequest, householdId, secondInvitee.id)

    const householdRest = await ownerRequest
      .get(`/api/v1/households/${householdId}/invitations`)
      .query({ limit: 1 })
      .expect(200)
    const householdTool = await read(caller(owner), 'invitations', {
      household_id: householdId,
      limit: 1,
    })
    expect(householdTool).toEqual(householdRest.body)
    const cursor = (householdTool.page_info as { end_cursor: string }).end_cursor
    expect(
      await read(caller(owner), 'invitations', {
        household_id: householdId,
        limit: 1,
        after: cursor,
      }),
    ).toEqual(
      (
        await ownerRequest
          .get(`/api/v1/households/${householdId}/invitations`)
          .query({ limit: 1, after: cursor })
          .expect(200)
      ).body,
    )

    const inviteeRequest = createRequest()
    await inviteeRequest.authenticateAs(invitee)
    expect(await read(caller(invitee), 'my_invitations', {})).toEqual(
      (await inviteeRequest.get('/api/v1/my/household-invitations').expect(200)).body,
    )
    expect(await read(caller(stranger), 'my_invitations', {})).toMatchObject({ results: [] })

    const strangerRequest = createRequest()
    await strangerRequest.authenticateAs(stranger)
    await strangerRequest.get(`/api/v1/households/${householdId}/invitations`).expect(404)
    await expectMcpToolFunctionThrows(
      caller(stranger),
      'read_my_households',
      optionArgs('invitations', { household_id: householdId }),
      { status: 404, message: 'Household not found' },
    )
  })

  it('invites, revokes, accepts, and declines with REST-equivalent results', async () => {
    const owner = await createTestUser()
    const invitee = await createTestUser()
    const accepter = await createTestUser()
    const decliner = await createTestUser()
    const restAccepter = await createTestUser()
    const restDecliner = await createTestUser()
    const restRevoker = await createTestUser()
    const request = createRequest()
    await request.authenticateAs(owner)
    const householdId = await household(request)

    const restInvite = await request
      .post(`/api/v1/households/${householdId}/invitations`)
      .send({ user: invitee.id, relationship: 'friend' })
      .expect(201)
    expect(
      await write(caller(owner, 'plus'), 'invite', {
        household_id: householdId,
        user: invitee.username,
        relationship: 'friend',
      }),
    ).toEqual(restInvite.body)

    const revoke = await invitation(request, householdId, accepter.id)
    const restRevoke = await invitation(request, householdId, restRevoker.id)
    expect(
      await write(caller(owner, 'plus'), 'revoke_invitation', {
        household_id: householdId,
        invitation_id: revoke.id,
      }),
    ).toEqual({ success: true })
    expect(
      (await request.get(`/api/v1/households/${householdId}/invitations`).expect(200)).body.results,
    ).toHaveLength(1)
    await request
      .delete(`/api/v1/households/${householdId}/invitations/${restRevoke.id}`)
      .expect(204)

    const accept = await invitation(request, householdId, accepter.id)
    const membershipResult = await write(caller(accepter, 'plus'), 'accept_invitation', {
      invitation_id: accept.id,
    })
    expect(membershipResult.membership).toMatchObject({ household_id: householdId })
    expect(
      (await request.get(`/api/v1/households/${householdId}/memberships`).expect(200)).body.results,
    ).toContainEqual(membershipResult.membership)
    const restAccept = await invitation(request, householdId, restAccepter.id)
    const restAccepterRequest = createRequest()
    await restAccepterRequest.authenticateAs(restAccepter)
    const restMembership = await restAccepterRequest
      .post(`/api/v1/my/household-invitations/${restAccept.id}/acceptance`)
      .send({})
      .expect(200)
    expect(restMembership.body).toMatchObject({ membership: { household_id: householdId } })

    const decline = await invitation(request, householdId, decliner.id)
    const declinerRequest = createRequest()
    await declinerRequest.authenticateAs(decliner)
    expect(
      await write(caller(decliner, 'plus'), 'decline_invitation', { invitation_id: decline.id }),
    ).toEqual({ success: true })
    const restDecline = await invitation(request, householdId, restDecliner.id)
    const restDeclinerRequest = createRequest()
    await restDeclinerRequest.authenticateAs(restDecliner)
    await restDeclinerRequest
      .post(`/api/v1/my/household-invitations/${restDecline.id}/decline`)
      .send({})
      .expect(204)
  })

  it('requires the read scope and Plus plan for the matching operations', async () => {
    const user = await createTestUser()
    const noScopes = caller(user)
    expect(
      await callRejectedMcpTool(
        noScopes,
        'read_my_households',
        optionArgs('my_invitations', {}),
        [],
      ),
    ).toContain('Missing required scopes')
    await expect(
      callRejectedMcpTool(
        noScopes,
        'manage_my_households',
        optionArgs('decline_invitation', { invitation_id: crypto.randomUUID() }),
        WRITE,
      ),
    ).resolves.toContain('Plus plan')
  })
})
