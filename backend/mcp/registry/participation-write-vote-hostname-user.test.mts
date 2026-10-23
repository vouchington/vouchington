import { describe, expect, it } from 'vitest'
import { createTestUser, insertTestUrlHostname } from '@voucha/test-helpers'
import { createTestPlusMcpCaller } from '@voucha/test-helpers/mcp-plus-caller'
import {
  callRejectedMcpTool,
  callStructuredMcpTool,
  optionArgs,
} from '@voucha/test-helpers/mcp-tool-contract'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  getHostnameElectionVote,
  upsertHostnameElectionVotes,
} from '@services/elections-votes/hostname'
import { getUserVouchElectionVote } from '@services/elections-votes/user-vouch'

const VOTE_SCOPES = ['votes:write'] as const

const targets = {
  hostname: {
    segment: 'hostnames/:id/vote',
    getVote: getHostnameElectionVote,
    missing: 'Hostname not found',
  },
  user_vouch: {
    segment: 'users/:id/vouch-vote',
    getVote: getUserVouchElectionVote,
    missing: 'User not found',
  },
} as const

function route(kind: keyof typeof targets, id: string) {
  return `/api/v1/${targets[kind].segment.replace(':id', id)}`
}

async function createTarget(kind: keyof typeof targets): Promise<string> {
  if (kind === 'user_vouch') return (await createTestUser()).id
  return insertTestUrlHostname({ hostname: `${crypto.randomUUID().slice(0, 8)}.example.com` })
}

describe.each(['hostname', 'user_vouch'] as const)('vote %s options', kind => {
  it('sets, recasts and clears the ballot like its REST twin', async () => {
    const [mcpUser, restUser] = await Promise.all([
      createTestPlusMcpCaller(),
      createTestPlusMcpCaller(),
    ])
    const id = await createTarget(kind)
    const request = createRequest()
    await request.authenticateAs(restUser)
    const { getVote } = targets[kind]
    const call = (option: string, args: Record<string, string>) =>
      callStructuredMcpTool(mcpUser, 'vote', optionArgs(option, args), VOTE_SCOPES)

    for (const choice of ['like', 'dislike']) {
      expect(await call(`set_${kind}`, { id, choice })).toEqual({ success: true })
      await request.put(route(kind, id)).send({ choice }).expect(204)
      expect((await getVote(mcpUser.id, id))?.choice).toBe(choice)
      expect((await getVote(restUser.id, id))?.choice).toBe(choice)
    }
    expect(await call(`clear_${kind}`, { id })).toEqual({ success: true })
    await request.delete(route(kind, id)).expect(204)
    expect(await getVote(mcpUser.id, id)).toBeNull()
    expect(await getVote(restUser.id, id)).toBeNull()
    // Clearing an absent ballot is a no-op in both.
    expect(await call(`clear_${kind}`, { id })).toEqual({ success: true })
    await request.delete(route(kind, id)).expect(204)
  })

  it('returns the REST missing-target responses', async () => {
    const user = await createTestPlusMcpCaller()
    const id = crypto.randomUUID()
    const request = createRequest()
    await request.authenticateAs(user)
    const { missing } = targets[kind]
    const set = JSON.parse(
      await callRejectedMcpTool(
        user,
        'vote',
        optionArgs(`set_${kind}`, { id, choice: 'like' }),
        VOTE_SCOPES,
      ),
    )
    expect(set).toMatchObject({ error: { status: 404, message: missing } })
    await request.put(route(kind, id)).send({ choice: 'like' }).expect(404)
    const clear = JSON.parse(
      await callRejectedMcpTool(user, 'vote', optionArgs(`clear_${kind}`, { id }), VOTE_SCOPES),
    )
    expect(clear).toMatchObject({ error: { status: 404, message: missing } })
    await request.delete(route(kind, id)).expect(404)
  })
})

describe('vote user_vouch self guard', () => {
  it('refuses a self vouch with the REST status', async () => {
    const user = await createTestPlusMcpCaller()
    const request = createRequest()
    await request.authenticateAs(user)
    const error = JSON.parse(
      await callRejectedMcpTool(
        user,
        'vote',
        optionArgs('set_user_vouch', { id: user.id, choice: 'like' }),
        VOTE_SCOPES,
      ),
    )
    expect(error).toMatchObject({ error: { status: 403, message: 'Cannot vote on yourself' } })
    await request.put(route('user_vouch', user.id)).send({ choice: 'like' }).expect(403)
    expect(await getUserVouchElectionVote(user.id, user.id)).toBeNull()
  })
})

describe('vote hostname visibility', () => {
  it('hides a blocked hostname from new ballots but lets a prior public ballot be cleared', async () => {
    const [user, bystander] = await Promise.all([createTestPlusMcpCaller(), createTestUser()])
    const id = await insertTestUrlHostname({
      hostname: `${crypto.randomUUID().slice(0, 8)}.example.com`,
      is_blocked: true,
    })
    const request = createRequest()
    await request.authenticateAs(user)
    const rejected = (option: string, args: Record<string, string>) =>
      callRejectedMcpTool(user, 'vote', optionArgs(option, args), VOTE_SCOPES)

    expect(JSON.parse(await rejected('set_hostname', { id, choice: 'like' }))).toMatchObject({
      error: { status: 404, message: 'Hostname not found' },
    })
    await request.put(route('hostname', id)).send({ choice: 'like' }).expect(404)
    expect(JSON.parse(await rejected('clear_hostname', { id }))).toMatchObject({
      error: { status: 404 },
    })
    await request.delete(route('hostname', id)).expect(404)

    await upsertHostnameElectionVotes(user.id, [{ entityId: id, score: 1 }])
    expect(
      await callStructuredMcpTool(user, 'vote', optionArgs('clear_hostname', { id }), VOTE_SCOPES),
    ).toEqual({ success: true })
    expect(await getHostnameElectionVote(user.id, id)).toBeNull()
    expect(await getHostnameElectionVote(bystander.id, id)).toBeNull()
  })
})
