import {
  optionArgs,
  callRejectedMcpTool,
  callStructuredMcpTool,
} from '@voucha/test-helpers/mcp-tool-contract'
import { afterEach, describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  createTestPost,
  createTestUser,
  insertTestTopic,
  insertTestUrlHostname,
  suspendTestUser,
  unsuspendTestUser,
} from '@voucha/test-helpers'
import setBookmarkTool from '../set-bookmark.mts'

const SCOPES = ['bookmarks:read', 'bookmarks:write'] as const
const PRIVATE_SCOPES = [...SCOPES, 'post-relations.owned-private:write'] as const
const setTarget = (entity_type: string, entity: string, predicate: string) => ({
  predicate,
  targets: [{ entity_type, entity }],
})

async function createCaller(plan: 'plus' | null = 'plus') {
  return { ...(await createTestUser()), membership_plan: plan }
}

async function createTopic(createdById: string): Promise<string> {
  return insertTestTopic({
    name: `Bookmark tool topic ${crypto.randomUUID()}`,
    slug: `bookmark-tool-topic-${crypto.randomUUID()}`,
    createdById,
  })
}

async function getBookmarks(user: { id: string }, entityType: string, entityId: string) {
  const request = createRequest()
  await request.authenticateAs(user as Parameters<typeof request.authenticateAs>[0])
  const response = await request.get(`/api/v1/bookmarks/${entityType}/${entityId}`).expect(200)
  return response.body.bookmarks as Record<string, boolean>
}

describe('manage_bookmark.set and manage_bookmark.remove contract — real DB', () => {
  const suspendedUserIds: string[] = []

  afterEach(async () => {
    await Promise.all(suspendedUserIds.splice(0).map(unsuspendTestUser))
  })

  it('sets the relation the REST route sets, and setting it again changes nothing', async () => {
    const caller = await createCaller()
    const topicId = await createTopic(caller.id)
    const setArgs = setTarget('topic', topicId, 'follow')

    const first = await callStructuredMcpTool(
      caller,
      'manage_bookmark',
      optionArgs('set', setArgs),
      SCOPES,
    )
    const second = await callStructuredMcpTool(
      caller,
      'manage_bookmark',
      optionArgs('set', setArgs),
      SCOPES,
    )
    const request = createRequest()
    await request.authenticateAs(caller)
    const rest = await request.put(`/api/v1/bookmarks/topic/${topicId}/follow`).expect(200)

    const bookmark = (first.results as { bookmark: object }[])[0]?.bookmark
    expect(bookmark).toMatchObject({
      subject_id: caller.id,
      object_id: topicId,
      created_by_id: caller.id,
    })
    expect(second).toEqual(first)
    expect(rest.body.bookmark).toMatchObject(bookmark as object)
    expect(await getBookmarks(caller, 'topic', topicId)).toEqual({ follow: true })
  })

  it('removes the relation as the REST route does, and removing it again changes nothing', async () => {
    const caller = await createCaller()
    const topicId = await createTopic(caller.id)
    const args = { entity_type: 'topic', entity_id: topicId, predicate: 'follow' }
    await callStructuredMcpTool(
      caller,
      'manage_bookmark',
      optionArgs('set', setTarget('topic', topicId, 'follow')),
      SCOPES,
    )

    expect(
      await callStructuredMcpTool(caller, 'manage_bookmark', optionArgs('remove', args), SCOPES),
    ).toEqual({
      success: true,
    })
    expect(await getBookmarks(caller, 'topic', topicId)).toEqual({})
    expect(
      await callStructuredMcpTool(caller, 'manage_bookmark', optionArgs('remove', args), SCOPES),
    ).toEqual({
      success: true,
    })
  })

  it.each(['mute', 'block'])('%s of a topic drops the follow, as the REST route does', async p => {
    const caller = await createCaller()
    const topicId = await createTopic(caller.id)
    await callStructuredMcpTool(
      caller,
      'manage_bookmark',
      optionArgs('set', setTarget('topic', topicId, 'follow')),
      SCOPES,
    )

    await callStructuredMcpTool(
      caller,
      'manage_bookmark',
      optionArgs('set', setTarget('topic', topicId, p)),
      SCOPES,
    )

    expect(await getBookmarks(caller, 'topic', topicId)).toEqual({ [p]: true })
  })

  it('hides a blocked hostname from a non-moderator and creates nothing', async () => {
    const caller = await createCaller()
    const hostnameId = await insertTestUrlHostname({
      hostname: `bookmark-${crypto.randomUUID().replaceAll('-', '')}.example`,
      is_blocked: true,
    })

    const hidden = await callStructuredMcpTool(
      caller,
      'manage_bookmark',
      optionArgs('set', setTarget('url_hostname', hostnameId, 'mute')),
      SCOPES,
    )
    expect(hidden.results).toMatchObject([{ status: 'error', error: 'Entity not found' }])
    expect(await getBookmarks(caller, 'url_hostname', hostnameId)).toEqual({})
  })

  it('refuses a read-only scope grant and a free plan before touching anything', async () => {
    const caller = await createCaller()
    const free = await createCaller(null)
    const topicId = await createTopic(caller.id)
    const args = { entity_type: 'topic', entity_id: topicId, predicate: 'follow' }
    const setArgs = setTarget('topic', topicId, 'follow')

    expect(
      await callRejectedMcpTool(caller, 'manage_bookmark', optionArgs('set', setArgs), [
        'bookmarks:read',
      ]),
    ).toContain('Tool requires scopes bookmarks:read, bookmarks:write')
    expect(
      await callRejectedMcpTool(caller, 'manage_bookmark', optionArgs('remove', args), [
        'bookmarks:read',
      ]),
    ).toContain('Tool requires scopes')
    expect(
      await callRejectedMcpTool(free, 'manage_bookmark', optionArgs('set', setArgs), SCOPES),
    ).toContain('requires a higher plan')
    expect(await getBookmarks(caller, 'topic', topicId)).toEqual({})
  })

  it('refuses a suspended user before setting or removing', async () => {
    const caller = await createCaller()
    const topicId = await createTopic(caller.id)
    const args = { entity_type: 'topic', entity_id: topicId, predicate: 'follow' }
    await callStructuredMcpTool(
      caller,
      'manage_bookmark',
      optionArgs('set', setTarget('topic', topicId, 'follow')),
      SCOPES,
    )
    const otherId = await createTopic(caller.id)
    await suspendTestUser(caller.id)
    suspendedUserIds.push(caller.id)

    await callRejectedMcpTool(
      caller,
      'manage_bookmark',
      optionArgs('set', setTarget('topic', otherId, 'follow')),
      SCOPES,
    )
    await callRejectedMcpTool(caller, 'manage_bookmark', optionArgs('remove', args), SCOPES)

    expect(await getBookmarks(caller, 'topic', otherId)).toEqual({})
    expect(await getBookmarks(caller, 'topic', topicId)).toEqual({ follow: true })
  })

  it.each([
    [
      'a REST-only predicate',
      { entity_type: 'topic', entity_id: crypto.randomUUID(), predicate: 'hide' },
    ],
    [
      'an unknown entity type',
      { entity_type: 'list', entity_id: crypto.randomUUID(), predicate: 'save' },
    ],
    [
      'an extra field',
      { entity_type: 'topic', entity_id: crypto.randomUUID(), predicate: 'follow', x: 1 },
    ],
  ])('refuses %s as invalid arguments', async (_label, args) => {
    const caller = await createCaller()
    const { entity_type, entity_id, predicate, ...extra } = args
    const setArgs = { predicate, targets: [{ entity_type, entity: entity_id }], ...extra }

    expect(
      await callRejectedMcpTool(caller, 'manage_bookmark', optionArgs('set', setArgs), SCOPES),
    ).toContain('Invalid tool arguments')
    expect(
      await callRejectedMcpTool(caller, 'manage_bookmark', optionArgs('remove', args), SCOPES),
    ).toContain('Invalid tool arguments')
  })

  it('reports a bad predicate and a missing entity on that target', async () => {
    const caller = await createCaller()
    const context = { credentialOwnerId: caller.id, grantedScopes: SCOPES }
    const result = await setBookmarkTool.function(caller)(
      {
        predicate: 'follow',
        targets: [
          { entity_type: 'rss_feed_item', entity: crypto.randomUUID() },
          { entity_type: 'topic', entity: crypto.randomUUID() },
          { entity_type: 'topic', entity: 'nope' },
        ],
      },
      context,
    )
    expect(result.results.map(item => item.error)).toEqual([
      'Invalid bookmark type.',
      'Entity not found',
      'Entity not found',
    ])
  })

  it('reaches the caller’s own private post only with the exact private grant', async () => {
    const caller = await createCaller()
    const post = await createTestPost({ user: caller, privacy: 'private', broadcast: 'users' })
    const args = { entity_type: 'post', entity_id: post.id, predicate: 'save' }
    const setArgs = setTarget('post', post.id, 'save')

    const denied = await callStructuredMcpTool(
      caller,
      'manage_bookmark',
      optionArgs('set', setArgs),
      SCOPES,
    )
    expect(denied.results).toMatchObject([{ status: 'error' }])
    expect(await getBookmarks(caller, 'post', post.id)).toEqual({})

    await callStructuredMcpTool(
      caller,
      'manage_bookmark',
      optionArgs('set', setArgs),
      PRIVATE_SCOPES,
    )
    expect(await getBookmarks(caller, 'post', post.id)).toEqual({ save: true })

    // Clearing a relation reads and discloses nothing, so it needs no private grant.
    await callStructuredMcpTool(caller, 'manage_bookmark', optionArgs('remove', args), SCOPES)
    expect(await getBookmarks(caller, 'post', post.id)).toEqual({})
  })

  it('hides another user’s private post even from a credential with the private grant', async () => {
    const caller = await createCaller()
    const owner = await createTestUser()
    const post = await createTestPost({ user: owner, privacy: 'private', broadcast: 'followers' })

    const hidden = await callStructuredMcpTool(
      caller,
      'manage_bookmark',
      optionArgs('set', setTarget('post', post.id, 'save')),
      PRIVATE_SCOPES,
    )
    expect(hidden.results).toMatchObject([{ status: 'error', error: 'Entity not found' }])
    expect(await getBookmarks(caller, 'post', post.id)).toEqual({})
  })
})
