import { beforeAll, describe, expect, it } from 'vitest'
import {
  CONTRIBUTING_USER_AGE_MS,
  approveTestPost,
  createRandomString,
  createTestUser,
  createTestUserWithAge,
  deleteTestPost,
  getLatestPostCategoryRevisionForTest,
  getPostHashtagSourcesForTest,
  insertTestPost,
  insertTestTopic,
  WEB_PROVENANCE,
} from '@voucha/test-helpers'
import { getMinUUIDv7ForDate } from '@modules/utils/ids'
import { POST_CONTENT_EDIT_WINDOW_EXPIRED } from '@modules/on-error/error-codes'
import type { PrivateUser } from '@services/users/types'
import { createPost } from '../create.mts'
import { getPostByAny } from '../get.mts'
import { addPostHashtag } from '../add-hashtag.mts'
import { removePostHashtag } from '../remove-hashtag.mts'
import { HASHTAG_IN_POST_TEXT_MESSAGE } from '../update/hashtag-intent.mts'

const firstParty = { kind: 'first_party' } as const
const delegateWith = (creator: PrivateUser, scope: string) =>
  ({ kind: 'delegated', credentialOwnerId: creator.id, grantedScopes: [scope] }) as const

describe('removePostHashtag', () => {
  let creator: PrivateUser

  beforeAll(async () => {
    creator = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
  })

  it('removes an explicit hashtag and keeps the other categories', async () => {
    const suffix = createRandomString(8).toLowerCase()
    const topicId = await insertTestTopic({
      name: `Remove category ${suffix}`,
      slug: `remove-category-${suffix}`,
      createdById: creator.id,
    })
    const post = await createPost(creator, WEB_PROVENANCE, {
      title: `Remove hashtag ${suffix}`,
      categories: [
        { type: 'topic', topic_id: topicId },
        { type: 'hashtag', hashtag: `#keep-${suffix}` },
        { type: 'hashtag', hashtag: `#Drop_Me.${suffix}` },
      ],
    })

    const result = await removePostHashtag(creator, post.id, `#drop-me-${suffix}`, firstParty)
    const committed = await getPostByAny(post.id, { readOnly: false })

    expect(result).toEqual({ post_id: post.id, tag: `drop-me-${suffix}`, removed: true })
    expect(committed?.post_explicit_categories).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'topic', topic_id: topicId }),
        expect.objectContaining({ type: 'hashtag', hashtag: `#keep-${suffix}` }),
      ]),
    )
    expect(committed?.post_explicit_categories).toHaveLength(2)
    expect(await getPostHashtagSourcesForTest(post.id)).toEqual([
      { alias: `keep-${suffix}`, authored_token: `#keep-${suffix}`, source: 'explicit' },
    ])
    expect(await getLatestPostCategoryRevisionForTest(post.id)).toMatchObject({
      after: [
        { type: 'topic', topic_id: topicId },
        { type: 'hashtag', hashtag: `#keep-${suffix}` },
      ],
    })
  })

  it('round-trips with add and reports a repeated removal without writing', async () => {
    const suffix = createRandomString(8).toLowerCase()
    const post = await createPost(creator, WEB_PROVENANCE, { title: `Round trip ${suffix}` })
    await addPostHashtag(creator, post.id, `#round-${suffix}`, firstParty)

    const first = await removePostHashtag(creator, post.id, `#round-${suffix}`, firstParty)
    const revision = await getLatestPostCategoryRevisionForTest(post.id)
    const second = await removePostHashtag(creator, post.id, `#round-${suffix}`, firstParty)

    expect(first.removed).toBe(true)
    expect(second).toEqual({ post_id: post.id, tag: `round-${suffix}`, removed: false })
    expect(await getLatestPostCategoryRevisionForTest(post.id)).toEqual(revision)
    expect(await getPostHashtagSourcesForTest(post.id)).toEqual([])
  })

  it('reports an absent hashtag as not removed without a revision', async () => {
    const suffix = createRandomString(8).toLowerCase()
    const post = await createPost(creator, WEB_PROVENANCE, {
      title: `Absent tag ${suffix}`,
      categories: [{ type: 'hashtag', hashtag: `#present-${suffix}` }],
    })
    const before = await getLatestPostCategoryRevisionForTest(post.id)

    await expect(
      removePostHashtag(creator, post.id, `#never-added-${suffix}`, firstParty),
    ).resolves.toEqual({ post_id: post.id, tag: `never-added-${suffix}`, removed: false })
    expect(await getLatestPostCategoryRevisionForTest(post.id)).toEqual(before)
    expect(await getPostHashtagSourcesForTest(post.id)).toHaveLength(1)
  })

  it('refuses a hashtag the post text writes before any mutation', async () => {
    const suffix = createRandomString(8).toLowerCase()
    const inBody = await createPost(creator, WEB_PROVENANCE, {
      title: `Body tag ${suffix}`,
      markdown: `Body mentions #body-${suffix}`,
    })
    const inTitle = await createPost(creator, WEB_PROVENANCE, {
      title: `Title tag #title-${suffix}`,
      categories: [{ type: 'hashtag', hashtag: `#title-${suffix}` }],
    })
    const bodySources = await getPostHashtagSourcesForTest(inBody.id)
    const titleSources = await getPostHashtagSourcesForTest(inTitle.id)

    await expect(
      removePostHashtag(creator, inBody.id, `#body-${suffix}`, firstParty),
    ).rejects.toMatchObject({ status: 422, message: HASHTAG_IN_POST_TEXT_MESSAGE })
    await expect(
      removePostHashtag(creator, inTitle.id, `#title-${suffix}`, firstParty),
    ).rejects.toMatchObject({ status: 422, message: HASHTAG_IN_POST_TEXT_MESSAGE })
    expect(await getPostHashtagSourcesForTest(inBody.id)).toEqual(bodySources)
    expect(await getPostHashtagSourcesForTest(inTitle.id)).toEqual(titleSources)
    expect(bodySources).toEqual([
      expect.objectContaining({ alias: `body-${suffix}`, source: 'markdown' }),
    ])
  })

  it('rejects an invalid hashtag, a non-author, an expired edit and a deleted post', async () => {
    const suffix = createRandomString(8).toLowerCase()
    const other = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
    const post = await createPost(creator, WEB_PROVENANCE, {
      title: `Guarded ${suffix}`,
      categories: [{ type: 'hashtag', hashtag: `#guarded-${suffix}` }],
    })
    await approveTestPost(post.id)
    const agedId = await insertTestPost({
      id: getMinUUIDv7ForDate(new Date(Date.now() - 2 * 24 * 60 * 60 * 1000)),
      title: `Aged remove ${suffix}`,
      markdown: 'Aged content',
      slug: `aged-remove-${suffix}`,
      createdById: creator.id,
    })
    const deleted = await createPost(creator, WEB_PROVENANCE, { title: `Deleted remove ${suffix}` })
    await deleteTestPost(deleted.id)

    await expect(
      removePostHashtag(creator, post.id, `#bad!${suffix}`, firstParty),
    ).rejects.toMatchObject({ status: 422 })
    await expect(
      removePostHashtag(other, post.id, `#guarded-${suffix}`, firstParty),
    ).rejects.toMatchObject({ status: 403 })
    await expect(
      removePostHashtag(creator, agedId, `#guarded-${suffix}`, firstParty),
    ).rejects.toMatchObject({ status: 403, code: POST_CONTENT_EDIT_WINDOW_EXPIRED })
    await expect(
      removePostHashtag(creator, deleted.id, `#guarded-${suffix}`, firstParty),
    ).rejects.toMatchObject({ status: 404 })
    expect(await getPostHashtagSourcesForTest(post.id)).toHaveLength(1)
  })

  it('requires the exact owned-private grant and never reaches another user private post', async () => {
    const suffix = createRandomString(8).toLowerCase()
    const post = await createPost(creator, WEB_PROVENANCE, {
      title: `Private remove ${suffix}`,
      broadcast: 'users',
      privacy: 'private',
      categories: [{ type: 'hashtag', hashtag: `#private-${suffix}` }],
    })
    const broad = delegateWith(creator, 'mcp.user:write')
    const exact = delegateWith(creator, 'post-relations.owned-private:write')

    await expect(
      removePostHashtag(creator, post.id, `#private-${suffix}`, broad),
    ).rejects.toMatchObject({ status: 403 })
    expect(await getPostHashtagSourcesForTest(post.id)).toHaveLength(1)
    await expect(
      removePostHashtag(creator, post.id, `#private-${suffix}`, exact),
    ).resolves.toMatchObject({ removed: true })
    expect(await getPostHashtagSourcesForTest(post.id)).toEqual([])

    const stranger = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
    const strangerExact = delegateWith(stranger, 'post-relations.owned-private:write')
    await expect(
      removePostHashtag(stranger, post.id, `#private-${suffix}`, strangerExact),
    ).rejects.toMatchObject({ status: 404 })
  })

  it('lets an administrator remove a hashtag from a private post first-party', async () => {
    const suffix = createRandomString(8).toLowerCase()
    const post = await createPost(creator, WEB_PROVENANCE, {
      title: `Admin private remove ${suffix}`,
      broadcast: 'users',
      privacy: 'private',
      categories: [{ type: 'hashtag', hashtag: `#admin-${suffix}` }],
    })
    const administrator = await createTestUser({ administrator: true })

    await expect(
      removePostHashtag(administrator, post.id, `#admin-${suffix}`, firstParty),
    ).resolves.toMatchObject({ removed: true })
  })
})
