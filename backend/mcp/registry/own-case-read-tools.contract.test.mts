import { describe, expect, it } from 'vitest'
import {
  createTestUser,
  insertTestModerationAppeal,
  insertTestPost,
  insertTestPostReview,
  insertTestReviewDispute,
  insertTestTopic,
  insertTestUserWarning,
  sendTestModerationAppealResponse,
  sendTestReviewDisputeResponse,
  suspendTestUserGetId,
  unsuspendTestUser,
} from '@voucha/test-helpers'
import { callRejectedMcpTool, callStructuredMcpTool } from '@voucha/test-helpers/mcp-tool-contract'
import type { ApiScope } from '@modules/scopes'

type Caller = Parameters<typeof callRejectedMcpTool>[0]
type Created = { id: string; facts: Record<string, string> }

const suffix = () => crypto.randomUUID().slice(0, 8)

async function disputeBy(disputantId: string): Promise<Created> {
  const creator = await createTestUser()
  const topicId = await insertTestTopic({
    name: `Read Topic ${suffix()}`,
    slug: `read-topic-${suffix()}`,
    createdById: creator.id,
  })
  const postId = await insertTestPost({
    title: `Read Review ${suffix()}`,
    slug: `read-review-${suffix()}`,
    createdById: creator.id,
    markdown: 'A review.',
    postType: 'review',
  })
  await insertTestPostReview(postId, topicId, 2)
  const id = await insertTestReviewDispute({
    postId,
    topicId,
    disputantUserId: disputantId,
    claimText: 'The private case for the moderators.',
  })
  return { id, facts: { post_id: postId, topic_id: topicId } }
}

async function appealBy(appellantId: string): Promise<Created> {
  const warning = await insertTestUserWarning({
    userId: appellantId,
    issuedById: (await createTestUser()).id,
  })
  const appeal = await insertTestModerationAppeal({
    appellantId,
    userWarningId: warning.id,
    appealReason: 'The private case for the moderators.',
  })
  return { id: appeal.id, facts: { target_type: 'warning', target_id: warning.id } }
}

const KINDS = [
  {
    noun: 'dispute',
    list: 'list_my_review_disputes',
    get: 'get_my_review_dispute',
    idArg: 'dispute_id',
    scopes: ['disputes:read'] as readonly ApiScope[],
    otherScopes: ['appeals:read'] as readonly ApiScope[],
    create: disputeBy,
    send: (id: string, publicResponse: string, dismissed = false) =>
      sendTestReviewDisputeResponse({
        disputeId: id,
        publicResponse,
        ...(dismissed ? { resolutionAction: 'dismiss' as const } : {}),
      }),
    resolution: 'no_action',
    hidden: ['claim_text', 'post_content', 'disputant_user_id'],
    foreign: 'disputant_user_id',
  },
  {
    noun: 'appeal',
    list: 'list_my_moderation_appeals',
    get: 'get_my_moderation_appeal',
    idArg: 'appeal_id',
    scopes: ['appeals:read'] as readonly ApiScope[],
    otherScopes: ['disputes:read'] as readonly ApiScope[],
    create: appealBy,
    send: (id: string, publicResponse: string, dismissed = false) =>
      sendTestModerationAppealResponse({
        appealId: id,
        publicResponse,
        ...(dismissed ? { resolutionAction: 'deny' as const } : {}),
      }),
    resolution: 'accept',
    hidden: ['appeal_reason', 'target_context', 'appellant_user_id'],
    foreign: 'appellant_user_id',
  },
]

const freeCaller = async (extra: { administrator?: boolean } = {}) => ({
  ...(await createTestUser(extra)),
  membership_plan: null,
})

describe.each(KINDS)('own $noun reads — real store', kind => {
  const items = (result: Record<string, unknown>) =>
    (result[`${kind.noun}s`] as { id: string }[]).map(item => item.id)
  const list = (caller: Caller, input: Record<string, unknown> = {}) =>
    callStructuredMcpTool(caller, kind.list, input, kind.scopes)
  const errorOf = async (caller: Caller, input: Record<string, unknown>) =>
    JSON.parse(await callRejectedMcpTool(caller, kind.get, input, kind.scopes))

  it('lists only the caller cases, newest first, as facts and without a paid plan', async () => {
    const caller = await freeCaller()
    const older = await kind.create(caller.id)
    const newer = await kind.create(caller.id)
    await kind.create((await createTestUser()).id)

    const result = await list(caller)

    expect(items(result)).toEqual([newer.id, older.id])
    expect(result[`${kind.noun}s`]).toEqual([
      expect.objectContaining({
        id: newer.id,
        ...newer.facts,
        status: 'pending',
        resolution_action: null,
        public_response: null,
        sent_at: null,
      }),
      expect.objectContaining({ id: older.id }),
    ])
    for (const item of result[`${kind.noun}s`] as object[]) {
      for (const field of kind.hidden) expect(item).not.toHaveProperty(field)
    }
  })

  it('lists a staff owner own cases only', async () => {
    const staff = await freeCaller({ administrator: true })
    await kind.create((await createTestUser()).id)
    const own = await kind.create(staff.id)

    expect(items(await list(staff))).toEqual([own.id])
  })

  it('filters by status and fences the moderator response once it was sent', async () => {
    const caller = await freeCaller()
    const pending = await kind.create(caller.id)
    const decided = await kind.create(caller.id)
    const dismissed = await kind.create(caller.id)
    await kind.send(decided.id, 'We reviewed your case carefully.')
    await kind.send(dismissed.id, 'Dismissed.', true)

    expect(items(await list(caller))).toEqual([pending.id])
    const resolved = await list(caller, { status: 'resolved' })
    expect(items(resolved)).toEqual([decided.id])
    const [item] = resolved[`${kind.noun}s`] as {
      public_response: string
      resolution_action: string
    }[]
    expect(item!.resolution_action).toBe(kind.resolution)
    expect(item!.public_response).toContain('We reviewed your case carefully.')
    expect(item!.public_response).not.toBe('We reviewed your case carefully.')
    expect(items(await list(caller, { status: 'dismissed' }))).toEqual([dismissed.id])
  })

  it('pages with an opaque cursor and refuses a malformed or foreign-status cursor', async () => {
    const caller = await freeCaller()
    const created = [
      await kind.create(caller.id),
      await kind.create(caller.id),
      await kind.create(caller.id),
    ]
    const newestFirst = created.map(item => item.id).toReversed()

    const first = await list(caller, { limit: 2 })
    const { end_cursor } = first.page_info as { has_next_page: boolean; end_cursor: string }
    const second = await list(caller, { limit: 2, after: end_cursor })

    expect(first.page_info).toMatchObject({ has_next_page: true })
    expect([...items(first), ...items(second)]).toEqual(newestFirst)
    expect(second.page_info).toMatchObject({ has_next_page: false, end_cursor: null })
    for (const input of [{ after: 'not-a-cursor' }, { status: 'resolved', after: end_cursor }]) {
      expect(await list(caller, input)).toEqual({ success: false, error: 'Invalid cursor' })
    }
  })

  it.each([
    ['an unknown status', { status: 'open' }],
    ['a zero limit', { limit: 0 }],
    ['a limit over 100', { limit: 101 }],
    ['an unexpected field', { [kind.foreign]: crypto.randomUUID() }],
  ])('refuses %s as invalid arguments', async (_label, input) => {
    expect(await callRejectedMcpTool(await freeCaller(), kind.list, input, kind.scopes)).toContain(
      'Invalid tool arguments',
    )
  })

  it('requires the read scope to list', async () => {
    expect(
      await callRejectedMcpTool(await freeCaller(), kind.list, {}, kind.otherScopes),
    ).toContain('Tool requires scopes')
  })

  it('gets the caller case as facts without a paid plan', async () => {
    const caller = await freeCaller()
    const created = await kind.create(caller.id)

    const result = await callStructuredMcpTool(
      caller,
      kind.get,
      { [kind.idArg]: created.id },
      kind.scopes,
    )

    expect(result).toEqual({
      success: true,
      [kind.noun]: expect.objectContaining({ id: created.id, ...created.facts, status: 'pending' }),
    })
    for (const field of kind.hidden) expect(result[kind.noun]).not.toHaveProperty(field)
  })

  it('refuses another user case, even to staff, and an unknown id', async () => {
    const created = await kind.create((await createTestUser()).id)
    const stranger = await freeCaller()
    const staff = await freeCaller({ administrator: true })

    for (const caller of [stranger, staff]) {
      expect(await errorOf(caller, { [kind.idArg]: created.id })).toMatchObject({
        error: { status: 403, code: 'FORBIDDEN' },
      })
    }
    expect(await errorOf(stranger, { [kind.idArg]: crypto.randomUUID() })).toMatchObject({
      error: { status: 404, code: 'NOT_FOUND' },
    })
  })

  it.each([
    ['a missing id', () => ({})],
    ['a malformed id', (idArg: string) => ({ [idArg]: 'not-a-uuid' })],
    [
      'an unexpected field',
      (idArg: string) => ({ [idArg]: crypto.randomUUID(), include: 'staff' }),
    ],
  ])('refuses %s to get as invalid arguments', async (_label, build) => {
    expect(
      await callRejectedMcpTool(await freeCaller(), kind.get, build(kind.idArg), kind.scopes),
    ).toContain('Invalid tool arguments')
  })

  it('requires the read scope to get', async () => {
    const caller = await freeCaller()
    const created = await kind.create(caller.id)
    expect(
      await callRejectedMcpTool(caller, kind.get, { [kind.idArg]: created.id }, kind.otherScopes),
    ).toContain('Tool requires scopes')
  })
})

describe('get_my_moderation_appeal — appeal filed on the web', () => {
  it('names an account suspension as the target of an appeal filed on the web', async () => {
    const caller = await freeCaller()
    const suspensionId = await suspendTestUserGetId(caller.id, 'Suspension for the read test')
    const appeal = await insertTestModerationAppeal({
      appellantId: caller.id,
      userSuspensionId: suspensionId,
    })
    await unsuspendTestUser(caller.id)

    const result = await callStructuredMcpTool(
      caller,
      'get_my_moderation_appeal',
      { appeal_id: appeal.id },
      ['appeals:read'],
    )

    expect(result.appeal).toMatchObject({
      id: appeal.id,
      target_type: 'suspension',
      target_id: suspensionId,
    })
  })
})
