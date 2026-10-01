import { beforeAll, describe, expect, it } from 'vitest'
import {
  beginTransaction,
  CONTRIBUTING_USER_AGE_MS,
  approveTestPost,
  createRandomString,
  createTestUser,
  createTestUserWithAge,
  getPostHashtagSourcesForTest,
  getTestPostgresBackendProcessId,
  getTopicAliasIdForTest,
  insertTestPost,
  insertTestTopic,
  waitForTestPostgresLockWaiter,
} from '@voucha/test-helpers'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { getMinUUIDv7ForDate } from '@modules/utils/ids'
import { POST_CONTENT_EDIT_WINDOW_EXPIRED, TAG_LIMIT_REACHED } from '@modules/on-error/error-codes'
import { manualTagLimitConfig } from '@services/tag-limits'
import { createUnlinkedTopicAlias } from '@services/topics'
import { lockPostPublication } from '@services/post-publication'
import type { PrivateUser } from '@services/users/types'
import { onceEntityListenerCompleted } from '@voucha/test-helpers/workers/entity-listeners/test-support'
import { addPostHashtag } from '../add-hashtag.mts'
import { createPost } from '../create.mts'
import { getPostByAny } from '../get.mts'
import { updatePost } from '../update.mts'

const firstParty = { kind: 'first_party' } as const

describe('addPostHashtag', () => {
  let creator: PrivateUser

  beforeAll(async () => {
    creator = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
  })

  it('retains topic and hashtag categories while creating a canonical alias', async () => {
    const suffix = createRandomString(8).toLowerCase()
    const topicId = await insertTestTopic({
      name: `Additive category ${suffix}`,
      slug: `additive-category-${suffix}`,
      createdById: creator.id,
    })
    const post = await createPost(creator, {
      title: `Additive hashtag ${suffix}`,
      categories: [
        { type: 'topic', topic_id: topicId },
        { type: 'hashtag', hashtag: `#retained-${suffix}` },
      ],
    })
    const result = await addPostHashtag(creator, post.id, `#New_Tag.${suffix}`, firstParty)
    const committed = await getPostByAny(post.id, { readOnly: false })

    expect(result).toMatchObject({
      post_id: post.id,
      tag: `new-tag-${suffix}`,
      topic_alias_id: expect.any(String),
    })
    expect(result.topic_alias_id).toBe(await getTopicAliasIdForTest(result.tag))
    expect(committed?.post_explicit_categories).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'topic', topic_id: topicId }),
        expect.objectContaining({ type: 'hashtag', hashtag: `#retained-${suffix}` }),
        expect.objectContaining({ type: 'hashtag', hashtag: `#New_Tag.${suffix}` }),
      ]),
    )
    expect(await getPostHashtagSourcesForTest(post.id)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ alias: result.tag, source: 'explicit' }),
        expect.objectContaining({ alias: `retained-${suffix}`, source: 'explicit' }),
      ]),
    )
  })

  it('reuses an existing canonical alias and applies its vote before returning', async () => {
    const suffix = createRandomString(8).toLowerCase()
    const tag = `existing-${suffix}`
    const alias = await createUnlinkedTopicAlias(`#${tag}`)
    const post = await createPost(creator, { title: `Existing hashtag ${suffix}` })
    const updated = onceEntityListenerCompleted('processPostUpdated', post.id)

    const first = await addPostHashtag(creator, post.id, `#${tag}`, firstParty)
    expect((await getPostByAny(post.id, { readOnly: false }))?.post_hashtags).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: alias.id, key: tag })]),
    )
    const second = await addPostHashtag(creator, post.id, `#${tag}`, firstParty)
    await updated

    expect(first).toEqual({ post_id: post.id, tag, topic_alias_id: alias.id })
    expect(second).toEqual(first)
    expect((await getPostByAny(post.id, { readOnly: false }))?.post_hashtags).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: alias.id, key: tag })]),
    )
    expect(
      (await getPostHashtagSourcesForTest(post.id)).filter(source => source.alias === tag),
    ).toHaveLength(1)
  })

  it('rejects a final category cap breach without creating an alias', async () => {
    const restore = overrideDynamicConfigFieldsForTest(manualTagLimitConfig, { free: 3 })
    try {
      const suffix = createRandomString(8).toLowerCase()
      const tag = `over-cap-${suffix}`
      const post = await createPost(creator, {
        title: `Cap hashtag ${suffix}`,
        categories: [1, 2, 3].map(number => ({
          type: 'hashtag' as const,
          hashtag: `#at-cap-${number}-${suffix}`,
        })),
      })

      await expect(addPostHashtag(creator, post.id, `#${tag}`, firstParty)).rejects.toMatchObject({
        status: 403,
        code: TAG_LIMIT_REACHED,
      })
      expect(await getTopicAliasIdForTest(tag)).toBeNull()
      expect(await getPostHashtagSourcesForTest(post.id)).toHaveLength(3)
    } finally {
      restore()
    }
  })

  it('rejects a non-author and an expired content edit', async () => {
    const suffix = createRandomString(8).toLowerCase()
    const other = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
    const post = await createPost(creator, { title: `Author only ${suffix}` })
    await approveTestPost(post.id)
    const agedId = await insertTestPost({
      id: getMinUUIDv7ForDate(new Date(Date.now() - 2 * 24 * 60 * 60 * 1000)),
      title: `Aged hashtag ${suffix}`,
      markdown: 'Aged content',
      slug: `aged-hashtag-${suffix}`,
      createdById: creator.id,
    })

    await expect(
      addPostHashtag(other, post.id, `#not-author-${suffix}`, firstParty),
    ).rejects.toMatchObject({ status: 403 })
    await expect(
      addPostHashtag(creator, agedId, `#expired-${suffix}`, firstParty),
    ).rejects.toMatchObject({
      status: 403,
      code: POST_CONTENT_EDIT_WINDOW_EXPIRED,
    })
    expect(await getTopicAliasIdForTest(`not-author-${suffix}`)).toBeNull()
    expect(await getTopicAliasIdForTest(`expired-${suffix}`)).toBeNull()
  })

  it('requires exact delegated authority over both private candidate and root', async () => {
    const suffix = createRandomString(8).toLowerCase()
    const privatePost = await createPost(creator, {
      title: `Private tag ${suffix}`,
      broadcast: 'users',
      privacy: 'private',
    })
    const broad = {
      kind: 'delegated',
      credentialOwnerId: creator.id,
      grantedScopes: ['mcp.user:write'],
    } as const
    const exact = {
      kind: 'delegated',
      credentialOwnerId: creator.id,
      grantedScopes: ['post-relations.owned-private:write'],
    } as const

    await expect(
      addPostHashtag(creator, privatePost.id, `#denied-${suffix}`, broad),
    ).rejects.toMatchObject({ status: 403 })
    expect(await getTopicAliasIdForTest(`denied-${suffix}`)).toBeNull()
    await expect(
      addPostHashtag(creator, privatePost.id, `#allowed-${suffix}`, exact),
    ).resolves.toMatchObject({ tag: `allowed-${suffix}` })

    const anotherAuthor = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
    const foreignRoot = await createPost(anotherAuthor, {
      title: `Foreign root ${suffix}`,
      broadcast: 'users',
      privacy: 'private',
    })
    await approveTestPost(foreignRoot.id)
    const reply = await createPost(creator, {
      post_type: 'comment',
      parent_id: foreignRoot.id,
      markdown: `Reply ${suffix}`,
    })
    await approveTestPost(reply.id)
    await expect(
      addPostHashtag(creator, reply.id, `#foreign-root-${suffix}`, exact),
    ).rejects.toMatchObject({ status: 403 })
    expect(await getTopicAliasIdForTest(`foreign-root-${suffix}`)).toBeNull()
  })

  it('preserves public delegated and private first-party administrator authority', async () => {
    const suffix = createRandomString(8).toLowerCase()
    const publicPost = await createPost(creator, { title: `Public delegated ${suffix}` })
    const delegated = {
      kind: 'delegated',
      credentialOwnerId: creator.id,
      grantedScopes: ['mcp.user:write'],
    } as const
    await expect(
      addPostHashtag(creator, publicPost.id, `#public-${suffix}`, delegated),
    ).resolves.toMatchObject({ tag: `public-${suffix}` })

    const privatePost = await createPost(creator, {
      title: `Admin private ${suffix}`,
      broadcast: 'users',
      privacy: 'private',
    })
    const administrator = await createTestUser({ administrator: true })
    await expect(
      addPostHashtag(administrator, privatePost.id, `#admin-${suffix}`, firstParty),
    ).resolves.toMatchObject({ tag: `admin-${suffix}` })
  })

  it('serializes additive intent with a replacement category update', async () => {
    const suffix = createRandomString(8).toLowerCase()
    const post = await createPost(creator, {
      title: `Race ${suffix}`,
      categories: [{ type: 'hashtag', hashtag: `#initial-${suffix}` }],
    })
    await using holder = await beginTransaction()
    await lockPostPublication(holder, post.id)
    const holderPid = await getTestPostgresBackendProcessId(holder)
    const additive = addPostHashtag(creator, post.id, `#added-${suffix}`, firstParty)
    try {
      await waitForTestPostgresLockWaiter(holderPid, 'lockPostPublicationCaptures')
      const replacement = updatePost(creator, post, {
        categories: [{ type: 'hashtag', hashtag: `#replacement-${suffix}` }],
      })
      await holder.commit()
      await Promise.all([additive, replacement])
    } finally {
      await holder.commit()
    }

    expect(await getPostHashtagSourcesForTest(post.id)).toEqual([
      {
        alias: `replacement-${suffix}`,
        authored_token: `#replacement-${suffix}`,
        source: 'explicit',
      },
    ])
  })

  it('unions against the locked replacement when the replacement wins first', async () => {
    const suffix = createRandomString(8).toLowerCase()
    const post = await createPost(creator, {
      title: `Reverse race ${suffix}`,
      categories: [{ type: 'hashtag', hashtag: `#initial-${suffix}` }],
    })
    await using holder = await beginTransaction()
    await lockPostPublication(holder, post.id)
    const holderPid = await getTestPostgresBackendProcessId(holder)
    const replacement = updatePost(creator, post, {
      categories: [{ type: 'hashtag', hashtag: `#replacement-${suffix}` }],
    })
    try {
      await waitForTestPostgresLockWaiter(holderPid, 'lockPostPublicationScope')
      const additive = addPostHashtag(creator, post.id, `#added-${suffix}`, firstParty)
      await holder.commit()
      await Promise.all([replacement, additive])
    } finally {
      await holder.commit()
    }

    expect(await getPostHashtagSourcesForTest(post.id)).toEqual([
      {
        alias: `added-${suffix}`,
        authored_token: `#added-${suffix}`,
        source: 'explicit',
      },
      {
        alias: `replacement-${suffix}`,
        authored_token: `#replacement-${suffix}`,
        source: 'explicit',
      },
    ])
  })
})
