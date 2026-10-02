import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import {
  CONTRIBUTING_USER_AGE_MS,
  approveTestPost,
  createRandomString,
  createTestUserWithAge,
  getPostHashtagSourcesForTest,
  suspendTestUser,
  unsuspendTestUser,
} from '@voucha/test-helpers'
import { callRejectedMcpTool, callStructuredMcpTool } from '@voucha/test-helpers/mcp-tool-contract'
import type { ApiScope } from '@modules/scopes'
import { createPost } from '@services/posts'
import { HASHTAG_IN_POST_TEXT_MESSAGE } from '@services/posts/update/hashtag-intent'
import removeEntityRelationTool from './remove-entity-relation.mts'

const SCOPES = ['entity-relations:read', 'entity-relations:write'] as const
const PRIVATE_SCOPES = [...SCOPES, 'post-relations.owned-private:write'] as const

type Owner = Awaited<ReturnType<typeof createCaller>>

async function createCaller(plan: 'plus' | null = 'plus') {
  return { ...(await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)), membership_plan: plan }
}

const removeArgs = (post_id: string, tag: string) => ({
  action: 'remove_tag' as const,
  post_id,
  tag,
})
const suffixed = () => createRandomString(8).toLowerCase()

/**
 * The call path reduces an error the tool throws to one generic failure text, so a refusal is
 * checked twice: the call is refused, and the tool function throws the status and message the
 * REST route sends.
 */
async function expectRefused(
  caller: Owner,
  args: ReturnType<typeof removeArgs>,
  scopes: readonly ApiScope[],
  expected: { status: number; message: string },
) {
  const invocation = { credentialOwnerId: caller.id, grantedScopes: scopes }
  await callRejectedMcpTool(caller, 'remove_entity_relation', args, scopes)
  await expect(removeEntityRelationTool.function(caller)(args, invocation)).rejects.toMatchObject(
    expected,
  )
}

describe('remove_entity_relation contract — real DB', () => {
  const suspendedUserIds: string[] = []
  let owner: Owner

  beforeAll(async () => {
    owner = await createCaller()
  })

  afterEach(async () => {
    await Promise.all(suspendedUserIds.splice(0).map(unsuspendTestUser))
  })

  const postWithTag = (suffix: string, extra: Record<string, unknown> = {}) =>
    createPost(owner, {
      title: `Remove tool ${suffix}`,
      categories: [{ type: 'hashtag', hashtag: `#drop-${suffix}` }],
      ...extra,
    })

  it('removes a hashtag add_entity_relation added, then reports a repeat as not removed', async () => {
    const suffix = suffixed()
    const post = await createPost(owner, { title: `Round trip ${suffix}` })
    const tag = `#round-${suffix}`
    await callStructuredMcpTool(
      owner,
      'add_entity_relation',
      { action: 'add_tag', post_id: post.id, tag },
      SCOPES,
    )
    expect(await getPostHashtagSourcesForTest(post.id)).toHaveLength(1)

    const first = await callStructuredMcpTool(
      owner,
      'remove_entity_relation',
      removeArgs(post.id, tag),
      SCOPES,
    )
    const second = await callStructuredMcpTool(
      owner,
      'remove_entity_relation',
      removeArgs(post.id, tag),
      SCOPES,
    )

    expect(first).toEqual({ post_id: post.id, tag: `round-${suffix}`, removed: true })
    expect(second).toEqual({ post_id: post.id, tag: `round-${suffix}`, removed: false })
    expect(await getPostHashtagSourcesForTest(post.id)).toEqual([])
  })

  it('refuses a hashtag the post text writes, leaving the post unchanged', async () => {
    const suffix = suffixed()
    const post = await createPost(owner, {
      title: `Inline ${suffix}`,
      markdown: `Mentions #inline-${suffix}`,
    })
    const before = await getPostHashtagSourcesForTest(post.id)

    await expectRefused(owner, removeArgs(post.id, `#inline-${suffix}`), SCOPES, {
      status: 422,
      message: HASHTAG_IN_POST_TEXT_MESSAGE,
    })

    expect(await getPostHashtagSourcesForTest(post.id)).toEqual(before)
  })

  it('needs the exact private grant for the caller’s own private post and hides foreign ones', async () => {
    const suffix = suffixed()
    const post = await postWithTag(suffix, { broadcast: 'users', privacy: 'private' })
    const args = removeArgs(post.id, `#drop-${suffix}`)

    await expectRefused(owner, args, SCOPES, { status: 403, message: 'Forbidden' })
    expect(await getPostHashtagSourcesForTest(post.id)).toHaveLength(1)

    const allowed = await callStructuredMcpTool(
      owner,
      'remove_entity_relation',
      args,
      PRIVATE_SCOPES,
    )
    expect(allowed).toMatchObject({ removed: true })
    expect(await getPostHashtagSourcesForTest(post.id)).toEqual([])

    const stranger = await createCaller()
    const hidden = await postWithTag(suffix, { broadcast: 'users', privacy: 'private' })
    await expectRefused(stranger, removeArgs(hidden.id, `#drop-${suffix}`), PRIVATE_SCOPES, {
      status: 404,
      message: 'Post not found',
    })
    expect(await getPostHashtagSourcesForTest(hidden.id)).toHaveLength(1)
  })

  it('refuses another user’s public post and a post that does not exist', async () => {
    const suffix = suffixed()
    const post = await postWithTag(suffix)
    await approveTestPost(post.id)
    const caller = await createCaller()

    await expectRefused(caller, removeArgs(post.id, `#drop-${suffix}`), SCOPES, {
      status: 403,
      message: 'Forbidden',
    })
    await expectRefused(caller, removeArgs(crypto.randomUUID(), `#drop-${suffix}`), SCOPES, {
      status: 404,
      message: 'Post not found',
    })
    expect(await getPostHashtagSourcesForTest(post.id)).toHaveLength(1)
  })

  it('refuses a read-only scope grant and a free plan', async () => {
    const suffix = suffixed()
    const post = await postWithTag(suffix)
    const args = removeArgs(post.id, `#drop-${suffix}`)
    const free = await createCaller(null)

    expect(
      await callRejectedMcpTool(owner, 'remove_entity_relation', args, ['entity-relations:read']),
    ).toContain('Tool requires scopes entity-relations:read, entity-relations:write')
    expect(await callRejectedMcpTool(free, 'remove_entity_relation', args, SCOPES)).toContain(
      'requires a higher plan',
    )
    expect(await getPostHashtagSourcesForTest(post.id)).toHaveLength(1)
  })

  it('refuses a suspended user before any change', async () => {
    const author = await createCaller()
    const suffix = suffixed()
    const post = await createPost(author, {
      title: `Suspended ${suffix}`,
      categories: [{ type: 'hashtag', hashtag: `#drop-${suffix}` }],
    })
    await suspendTestUser(author.id)
    suspendedUserIds.push(author.id)

    await expectRefused(author, removeArgs(post.id, `#drop-${suffix}`), SCOPES, {
      status: 403,
      message: 'Your account has been suspended',
    })
    expect(await getPostHashtagSourcesForTest(post.id)).toHaveLength(1)
  })

  it.each([
    [{}],
    [{ action: 'remove_tag', post_id: 'p' }],
    [{ action: 'remove_tag', tag: '#t' }],
    [{ action: 'remove_vote', post_id: 'p', tag: '#t' }],
    [{ action: 'remove_tag', post_id: 'p', tag: '#t', force: true }],
    [{ action: 'remove_tag', post_id: 7, tag: '#t' }],
  ])('refuses invalid arguments %j before any change', async args => {
    expect(await callRejectedMcpTool(owner, 'remove_entity_relation', args, SCOPES)).toContain(
      'Invalid tool arguments',
    )
  })
})
