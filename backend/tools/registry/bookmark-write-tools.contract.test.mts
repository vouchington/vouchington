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
import { callRejectedMcpTool, callStructuredMcpTool } from '@voucha/test-helpers/mcp-tool-contract'
import setBookmarkTool from '../set-bookmark.mts'

const SCOPES = ['bookmarks:read', 'bookmarks:write'] as const
const PRIVATE_SCOPES = [...SCOPES, 'post-relations.owned-private:write'] as const

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

describe('set_bookmark and remove_bookmark contract — real DB', () => {
  const suspendedUserIds: string[] = []

  afterEach(async () => {
    await Promise.all(suspendedUserIds.splice(0).map(unsuspendTestUser))
  })

  it('sets the relation the REST route sets, and setting it again changes nothing', async () => {
    const caller = await createCaller()
    const topicId = await createTopic(caller.id)
    const args = { entity_type: 'topic', entity_id: topicId, predicate: 'follow' }

    const first = await callStructuredMcpTool(caller, 'set_bookmark', args, SCOPES)
    const second = await callStructuredMcpTool(caller, 'set_bookmark', args, SCOPES)
    const request = createRequest()
    await request.authenticateAs(caller)
    const rest = await request.put(`/api/v1/bookmarks/topic/${topicId}/follow`).expect(200)

    expect(first).toMatchObject({
      success: true,
      bookmark: { subject_id: caller.id, object_id: topicId, created_by_id: caller.id },
    })
    expect(second).toEqual(first)
    expect(rest.body.bookmark).toMatchObject(first.bookmark as object)
    expect(await getBookmarks(caller, 'topic', topicId)).toEqual({ follow: true })
  })

  it('removes the relation as the REST route does, and removing it again changes nothing', async () => {
    const caller = await createCaller()
    const topicId = await createTopic(caller.id)
    const args = { entity_type: 'topic', entity_id: topicId, predicate: 'follow' }
    await callStructuredMcpTool(caller, 'set_bookmark', args, SCOPES)

    expect(await callStructuredMcpTool(caller, 'remove_bookmark', args, SCOPES)).toEqual({
      success: true,
    })
    expect(await getBookmarks(caller, 'topic', topicId)).toEqual({})
    expect(await callStructuredMcpTool(caller, 'remove_bookmark', args, SCOPES)).toEqual({
      success: true,
    })
  })

  it.each(['mute', 'block'])('%s of a topic drops the follow, as the REST route does', async p => {
    const caller = await createCaller()
    const topicId = await createTopic(caller.id)
    const base = { entity_type: 'topic', entity_id: topicId }
    await callStructuredMcpTool(caller, 'set_bookmark', { ...base, predicate: 'follow' }, SCOPES)

    await callStructuredMcpTool(caller, 'set_bookmark', { ...base, predicate: p }, SCOPES)

    expect(await getBookmarks(caller, 'topic', topicId)).toEqual({ [p]: true })
  })

  it('hides a blocked hostname from a non-moderator and creates nothing', async () => {
    const caller = await createCaller()
    const hostnameId = await insertTestUrlHostname({
      hostname: `bookmark-${crypto.randomUUID().replaceAll('-', '')}.example`,
      is_blocked: true,
    })

    await callRejectedMcpTool(
      caller,
      'set_bookmark',
      { entity_type: 'url_hostname', entity_id: hostnameId, predicate: 'mute' },
      SCOPES,
    )

    expect(await getBookmarks(caller, 'url_hostname', hostnameId)).toEqual({})
  })

  it('refuses a read-only scope grant and a free plan before touching anything', async () => {
    const caller = await createCaller()
    const free = await createCaller(null)
    const topicId = await createTopic(caller.id)
    const args = { entity_type: 'topic', entity_id: topicId, predicate: 'follow' }

    expect(await callRejectedMcpTool(caller, 'set_bookmark', args, ['bookmarks:read'])).toContain(
      'Tool requires scopes bookmarks:read, bookmarks:write',
    )
    expect(
      await callRejectedMcpTool(caller, 'remove_bookmark', args, ['bookmarks:read']),
    ).toContain('Tool requires scopes')
    expect(await callRejectedMcpTool(free, 'set_bookmark', args, SCOPES)).toContain(
      'requires a higher plan',
    )
    expect(await getBookmarks(caller, 'topic', topicId)).toEqual({})
  })

  it('refuses a suspended user before setting or removing', async () => {
    const caller = await createCaller()
    const topicId = await createTopic(caller.id)
    const args = { entity_type: 'topic', entity_id: topicId, predicate: 'follow' }
    await callStructuredMcpTool(caller, 'set_bookmark', args, SCOPES)
    const other = { ...args, entity_id: await createTopic(caller.id) }
    await suspendTestUser(caller.id)
    suspendedUserIds.push(caller.id)

    await callRejectedMcpTool(caller, 'set_bookmark', other, SCOPES)
    await callRejectedMcpTool(caller, 'remove_bookmark', args, SCOPES)

    expect(await getBookmarks(caller, 'topic', other.entity_id)).toEqual({})
    expect(await getBookmarks(caller, 'topic', topicId)).toEqual({ follow: true })
  })

  it.each([
    ['a malformed ID', { entity_type: 'topic', entity_id: 'nope', predicate: 'follow' }],
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

    expect(await callRejectedMcpTool(caller, 'set_bookmark', args, SCOPES)).toContain(
      'Invalid tool arguments',
    )
    expect(await callRejectedMcpTool(caller, 'remove_bookmark', args, SCOPES)).toContain(
      'Invalid tool arguments',
    )
  })

  it('refuses a predicate the entity type does not take, and an entity that is not there', async () => {
    const caller = await createCaller()
    const context = { credentialOwnerId: caller.id, grantedScopes: SCOPES }
    const wrongPredicate = { entity_type: 'rss_feed_item', predicate: 'follow' }
    const missing = { entity_type: 'topic', predicate: 'follow' }

    await expect(
      setBookmarkTool.function(caller)(
        { ...wrongPredicate, entity_id: crypto.randomUUID() },
        context,
      ),
    ).rejects.toMatchObject({ status: 422 })
    await expect(
      setBookmarkTool.function(caller)({ ...missing, entity_id: crypto.randomUUID() }, context),
    ).rejects.toMatchObject({ status: 404 })
  })

  it('reaches the caller’s own private post only with the exact private grant', async () => {
    const caller = await createCaller()
    const post = await createTestPost({ user: caller, privacy: 'private', broadcast: 'users' })
    const args = { entity_type: 'post', entity_id: post.id, predicate: 'save' }

    await callRejectedMcpTool(caller, 'set_bookmark', args, SCOPES)
    expect(await getBookmarks(caller, 'post', post.id)).toEqual({})

    await callStructuredMcpTool(caller, 'set_bookmark', args, PRIVATE_SCOPES)
    expect(await getBookmarks(caller, 'post', post.id)).toEqual({ save: true })

    // Clearing a relation reads and discloses nothing, so it needs no private grant.
    await callStructuredMcpTool(caller, 'remove_bookmark', args, SCOPES)
    expect(await getBookmarks(caller, 'post', post.id)).toEqual({})
  })

  it('hides another user’s private post even from a credential with the private grant', async () => {
    const caller = await createCaller()
    const owner = await createTestUser()
    const post = await createTestPost({ user: owner, privacy: 'private', broadcast: 'followers' })

    await callRejectedMcpTool(
      caller,
      'set_bookmark',
      { entity_type: 'post', entity_id: post.id, predicate: 'save' },
      PRIVATE_SCOPES,
    )

    expect(await getBookmarks(caller, 'post', post.id)).toEqual({})
  })
})
