import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  CONTRIBUTING_USER_AGE_MS,
  createTestUser,
  createTestUserDirect,
  createTestUserWithAge,
  insertTestPost,
  softDeleteUser,
  suspendTestUser,
  unsuspendTestUser,
} from '@voucha/test-helpers'
import { createSameIdElectionRelations } from '@voucha/test-helpers/entities/entity-relation-election-collisions'
import {
  callRejectedMcpTool,
  callStructuredMcpTool,
  type McpContractCaller,
} from '@voucha/test-helpers/mcp-tool-contract'
import {
  getEntityRelationElectionVote,
  upsertEntityRelationElectionVotes,
} from '@services/elections-votes/entity-relation'
import { createEntityRelationElectionTarget } from '@services/elections-votes/entity-relation/target'
import { updateEntityRelationElectionVoteStatsFromPrimary } from '@services/elections-votes/entity-relation/vote-stats'
import { upsertEntityRelation } from '@services/entity-relations'
import { entityRelationMetadatum } from '@services/entity-relations/metadata'
import { getEntityRelations } from '@services/entity-relations/query'
import { SYSTEM_ENTITY_RELATION_VIEWER } from '@services/entity-relations/viewer'
import { getUserTagTopics } from '@services/topics/user-tag-topics'

type Voter = Awaited<ReturnType<typeof createVoter>>

const SCOPES = ['entity-relations:read', 'entity-relations:write'] as const
const TOOL = 'withdraw_entity_relation_vote'
const RELATION_ID = '00000000-0000-4000-8000-000000000001'
const USER_TAG_TABLE = 'relation__user__category__topic'

const createVoter = () => createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
const asCaller = (user: Voter, plan: 'plus' | null = 'plus'): McpContractCaller => ({
  ...user,
  membership_plan: plan,
})
const refuse = (caller: McpContractCaller, args: Record<string, unknown>) =>
  callRejectedMcpTool(caller, TOOL, args, SCOPES)
const withdraw = (user: Voter, id: string) =>
  callStructuredMcpTool(asCaller(user), TOOL, { id }, SCOPES)

async function createPostRelation(owner: Voter): Promise<string> {
  const suffix = crypto.randomUUID().slice(0, 8)
  const [subject, object] = await Promise.all(
    ['from', 'to'].map(role =>
      insertTestPost({
        title: `Withdraw vote ${role} ${suffix}`,
        slug: `withdraw-vote-${role}-${suffix}`,
        createdById: owner.id,
        markdown: 'Test content',
      }),
    ),
  )
  const metadata = entityRelationMetadatum.find(
    item =>
      item.subject_type === 'post' && item.object_type === 'post' && item.predicate === 'related',
  )!
  const [relation] = await upsertEntityRelation(owner, metadata, { id: subject! }, [
    { id: object! },
  ])
  return relation!.id as string
}

async function castOnTheWeb(user: Voter, relationId: string) {
  const request = createRequest()
  await request.authenticateAs(user)
  await request
    .put(`/api/v1/entity-relations/${relationId}/vote`)
    .send({ choice: 'confirm' })
    .expect(204)
}

describe('withdraw_entity_relation_vote contract — real DB', () => {
  const suspendedUserIds: string[] = []
  let owner: Voter

  beforeAll(async () => {
    owner = await createVoter()
  })

  afterEach(async () => {
    await Promise.all(suspendedUserIds.splice(0).map(unsuspendTestUser))
  })

  it('removes only the caller’s vote, and a repeat or a never-cast vote still succeeds', async () => {
    const [voter, other, never] = await Promise.all([createVoter(), createVoter(), createVoter()])
    const relationId = await createPostRelation(owner)
    await castOnTheWeb(voter, relationId)
    await castOnTheWeb(other, relationId)
    await expect(getEntityRelationElectionVote(voter.id, relationId)).resolves.toMatchObject({
      choice: 'confirm',
    })

    expect(await withdraw(voter, relationId)).toEqual({ success: true })
    expect(await withdraw(voter, relationId)).toEqual({ success: true })
    expect(await withdraw(never, relationId)).toEqual({ success: true })

    await expect(getEntityRelationElectionVote(voter.id, relationId)).resolves.toBeNull()
    await expect(getEntityRelationElectionVote(never.id, relationId)).resolves.toBeNull()
    await expect(getEntityRelationElectionVote(other.id, relationId)).resolves.toMatchObject({
      choice: 'confirm',
    })
  })

  it('leaves the same ballots and user-tag stats as DELETE on the web, for an official account too', async () => {
    const admin = await createTestUser({ administrator: true })
    const target = await createTestUser()
    const [webVoter, toolVoter] = await Promise.all(
      [1, 2].map(() => createTestUserDirect({ withEmail: true, extraRoles: ['investor'] })),
    )
    const [tag] = await getUserTagTopics()
    const adminRequest = createRequest()
    await adminRequest.authenticateAs(admin)
    const created = await adminRequest
      .post(`/api/v1/entity-relations/user/${target.id}/category/topic`)
      .send({ objectId: tag!.id })
      .expect(201)
    const relationId = created.body.relation.id as string
    for (const historical of [webVoter!, toolVoter!]) {
      await upsertEntityRelationElectionVotes(historical.id, [{ entityId: relationId, score: 1 }])
    }
    const stats = async () => {
      await updateEntityRelationElectionVoteStatsFromPrimary(
        createEntityRelationElectionTarget(relationId, USER_TAG_TABLE),
      )
      const [relation] = await getEntityRelations('user', target.id, 'category', 'topic', {
        viewer: SYSTEM_ENTITY_RELATION_VIEWER,
      })
      return { up: relation!.votes_count_up, net: relation!.votes_score_net }
    }
    expect(await stats()).toEqual({ up: 3, net: 3 })

    const webRequest = createRequest()
    await webRequest.authenticateAs(webVoter!)
    await webRequest.delete(`/api/v1/entity-relations/${relationId}/vote`).expect(204)
    // The route refreshes a user-tag relation's stats from the primary before it answers.
    const [afterWeb] = await getEntityRelations('user', target.id, 'category', 'topic', {
      viewer: SYSTEM_ENTITY_RELATION_VIEWER,
    })
    expect({ up: afterWeb!.votes_count_up, net: afterWeb!.votes_score_net }).toEqual({
      up: 2,
      net: 2,
    })

    expect(await withdraw(toolVoter! as Voter, relationId)).toEqual({ success: true })
    const [afterTool] = await getEntityRelations('user', target.id, 'category', 'topic', {
      viewer: SYSTEM_ENTITY_RELATION_VIEWER,
    })
    expect({ up: afterTool!.votes_count_up, net: afterTool!.votes_score_net }).toEqual({
      up: 1,
      net: 1,
    })
    for (const historical of [webVoter!, toolVoter!]) {
      await expect(getEntityRelationElectionVote(historical.id, relationId)).resolves.toBeNull()
    }
  })

  it('refuses a suspended caller and keeps the ballot', async () => {
    const voter = await createVoter()
    const relationId = await createPostRelation(owner)
    await castOnTheWeb(voter, relationId)
    await suspendTestUser(voter.id)
    suspendedUserIds.push(voter.id)

    expect(await refuse(asCaller(voter), { id: relationId })).toMatch(
      /"status":403.*Your account has been suspended/,
    )

    await expect(getEntityRelationElectionVote(voter.id, relationId)).resolves.toMatchObject({
      choice: 'confirm',
    })
  })

  it('refuses a read-only grant and a free plan', async () => {
    const voter = await createVoter()
    const relationId = await createPostRelation(owner)
    await castOnTheWeb(voter, relationId)

    expect(
      await callRejectedMcpTool(asCaller(voter), TOOL, { id: relationId }, [
        'entity-relations:read',
      ]),
    ).toContain('Tool requires scopes entity-relations:read, entity-relations:write')
    expect(
      await callRejectedMcpTool(asCaller(voter, null), TOOL, { id: relationId }, SCOPES),
    ).toContain('requires a higher plan')

    await expect(getEntityRelationElectionVote(voter.id, relationId)).resolves.toMatchObject({
      choice: 'confirm',
    })
  })

  it('refuses a caller whose account was deleted after its credential was issued', async () => {
    const voter = await createVoter()
    const relationId = await createPostRelation(owner)
    await castOnTheWeb(voter, relationId)
    await softDeleteUser(voter.id)

    expect(await refuse(asCaller(voter), { id: relationId })).toMatch(
      /"status":401.*Tool current user not found/,
    )
  })

  it('reports an unknown relation as not found and an id shared by two tables as ambiguous', async () => {
    const voter = asCaller(await createVoter())
    const { id: sharedId } = await createSameIdElectionRelations({
      postCategory: 1,
      topicRelated: 1,
      viewerVotes: { postCategory: 1, topicRelated: -1 },
    })

    expect(await refuse(voter, { id: crypto.randomUUID() })).toMatch(
      /"status":404.*Entity relation not found/,
    )
    expect(await refuse(voter, { id: sharedId })).toMatch(
      /"status":409.*Entity relation id is ambiguous across relation families/,
    )
  })

  it.each([
    [{}],
    [{ id: 'not-a-uuid' }],
    [{ id: 7 }],
    [{ id: RELATION_ID, choice: 'dispute' }],
    [{ id: RELATION_ID, score: -1 }],
  ])('refuses the arguments %j before reading anything', async args => {
    const caller = asCaller(await createVoter())

    expect(await callRejectedMcpTool(caller, TOOL, args, SCOPES)).toContain(
      'Invalid tool arguments',
    )
  })
})
