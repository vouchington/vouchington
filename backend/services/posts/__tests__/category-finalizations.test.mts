import { describe, expect, it } from 'vitest'
import {
  createTestPost,
  createTestUser,
  getEntityRelation,
  getTestPostCategoryFinalization,
  persistTestPostCategoryFinalizationEdits,
  softDeleteUser,
  type TestPostCategoryFinalizationEdit,
  type TestPostCategoryFinalizationEditOptions,
} from '@voucha/test-helpers'
import { createUnlinkedTopicAlias } from '@services/topics'
import { getPostByAny } from '../get.mts'
import { syncPostHashtagCategoriesInTransaction } from '../hashtags.mts'
import {
  acknowledgePostCategoryFinalization,
  persistPostCategoryFinalization,
  reconcilePostCategoryFinalizationRows,
  type PostCategoryFinalization,
} from '../post-category-finalizations.mts'
import { withPostFinalizationLock } from '../update/post-finalization-lock.mts'

describe('post category finalization reconciliation', () => {
  it('recovers pending hashtag-category votes with the stored actor and topic-category owner', async () => {
    const owner = await createTestUser()
    const administrator = await createTestUser({ administrator: true })
    const suffix = Math.random().toString(36).slice(2, 12)
    const hashtag = `recovered-${suffix}`
    const post = await createTestPost({ user: owner, title: `Finalization recovery ${suffix}` })

    const pending = await withPostFinalizationLock(post.id, async () => {
      await persistTestPostCategoryFinalizationEdits({
        applyEdit: (edit, options) =>
          applyPostCategoryFinalizationEdit(edit, post.id, owner.id, options),
        edits: [{ actor: administrator, title: post.title, markdown: `#${hashtag}` }],
      })

      const pending = await getTestPostCategoryFinalization(post.id)
      expect(pending).toMatchObject({
        actor_user_ids: [administrator.id],
        post_id: post.id,
        topic_category_owner_id: owner.id,
      })
      return pending! as PostCategoryFinalization
    })

    await expect(reconcilePostCategoryFinalizationRows([pending])).resolves.toEqual({
      reconciled: 1,
    })
    await expect(getTestPostCategoryFinalization(post.id)).resolves.toBeUndefined()
    const finalizedPost = (await getPostByAny(post.id))!
    expect(finalizedPost.post_hashtags).toEqual(
      expect.arrayContaining([expect.objectContaining({ key: hashtag })]),
    )
  })

  it('acknowledges replay after an editor is soft-deleted while retaining live editor work', async () => {
    const owner = await createTestUser()
    const liveEditor = await createTestUser({ administrator: true })
    const deletedEditor = await createTestUser({ administrator: true })
    const suffix = Math.random().toString(36).slice(2, 12)
    const hashtag = `live-after-delete-${suffix}`
    const post = await createTestPost({ user: owner, title: `Deleted editor replay ${suffix}` })

    const pending = await withPostFinalizationLock(post.id, async () => {
      await persistTestPostCategoryFinalizationEdits({
        applyEdit: (edit, options) =>
          applyPostCategoryFinalizationEdit(edit, post.id, owner.id, options),
        edits: [{ actor: liveEditor, title: post.title, markdown: `#${hashtag}` }],
      })
      await persistPostCategoryFinalization(post.id, deletedEditor.id, owner.id, 'update', {})
      await softDeleteUser(deletedEditor.id)

      const pending = await getTestPostCategoryFinalization(post.id)
      expect(pending).not.toBeUndefined()
      return pending!
    })

    await expect(reconcilePostCategoryFinalizationRows([pending])).resolves.toEqual({
      reconciled: 1,
    })
    await expect(getTestPostCategoryFinalization(post.id)).resolves.toBeUndefined()
    const finalizedPost = (await getPostByAny(post.id))!
    expect(finalizedPost.post_hashtags).toEqual(
      expect.arrayContaining([expect.objectContaining({ key: hashtag })]),
    )
  })

  it('finalizes live actors’ hashtag votes when the stored topic owner is deleted', async () => {
    const owner = await createTestUser()
    const administrator = await createTestUser({ administrator: true })
    const suffix = Math.random().toString(36).slice(2, 12)
    const hashtag = `deleted-owner-${suffix}`
    const alias = await createUnlinkedTopicAlias(hashtag)
    const post = await createTestPost({ user: owner, title: `Deleted owner replay ${suffix}` })
    const pending = await withPostFinalizationLock(post.id, async () => {
      await persistTestPostCategoryFinalizationEdits({
        applyEdit: (edit, options) =>
          applyPostCategoryFinalizationEdit(edit, post.id, owner.id, options),
        edits: [{ actor: administrator, title: post.title, markdown: `#${hashtag}` }],
      })
      await softDeleteUser(owner.id)

      const pending = await getTestPostCategoryFinalization(post.id)
      expect(pending).not.toBeUndefined()
      return pending!
    })

    await expect(reconcilePostCategoryFinalizationRows([pending])).resolves.toEqual({
      reconciled: 1,
    })
    await expect(getTestPostCategoryFinalization(post.id)).resolves.toBeUndefined()
    const relations = await getEntityRelation(
      'relation__post__category__topic_alias',
      post.id,
      alias.id,
    )
    expect(relations[0]).toMatchObject({ votes_score_net: 1 })
  })

  it('does not acknowledge a newer finalization generation with stale work', async () => {
    const owner = await createTestUser()
    const post = await createTestPost({
      user: owner,
      title: `Generation fence ${Math.random().toString(36).slice(2, 12)}`,
    })

    await withPostFinalizationLock(post.id, async () => {
      const first = await persistPostCategoryFinalization(post.id, owner.id, owner.id, 'update', {})
      const second = await persistPostCategoryFinalization(
        post.id,
        owner.id,
        owner.id,
        'update',
        {},
      )

      expect(first.generation).toBe('1')
      expect(second.generation).toBe('2')

      await acknowledgePostCategoryFinalization(first)

      try {
        await expect(getTestPostCategoryFinalization(post.id)).resolves.toMatchObject({
          generation: second.generation,
        })
      } finally {
        await acknowledgePostCategoryFinalization(second)
      }
    })
    await expect(getTestPostCategoryFinalization(post.id)).resolves.toBeUndefined()
  })

  it('starts independent posts at generation 1', async () => {
    const owner = await createTestUser()
    const firstPost = await createTestPost({
      user: owner,
      title: `First generation ${Math.random().toString(36).slice(2, 12)}`,
    })
    const secondPost = await createTestPost({
      user: owner,
      title: `Second generation ${Math.random().toString(36).slice(2, 12)}`,
    })

    const first = await persistPostCategoryFinalization(
      firstPost.id,
      owner.id,
      owner.id,
      'update',
      {},
    )
    const second = await persistPostCategoryFinalization(
      secondPost.id,
      owner.id,
      owner.id,
      'update',
      {},
    )

    expect(first.generation).toBe('1')
    expect(second.generation).toBe('1')
    await acknowledgePostCategoryFinalization(first)
    await acknowledgePostCategoryFinalization(second)
  })

  it('reloads a recreated finalization after acquiring the post lock', async () => {
    const owner = await createTestUser()
    const editor = await createTestUser({ administrator: true })
    const suffix = Math.random().toString(36).slice(2, 12)
    const hashtag = `recreated-${suffix}`
    const post = await createTestPost({ user: owner, title: `Recreated work ${suffix}` })

    const stale = await withPostFinalizationLock(post.id, async () => {
      const stale = await persistPostCategoryFinalization(post.id, owner.id, owner.id, 'update', {})
      await acknowledgePostCategoryFinalization(stale)
      await persistTestPostCategoryFinalizationEdits({
        applyEdit: (edit, options) =>
          applyPostCategoryFinalizationEdit(edit, post.id, owner.id, options),
        edits: [{ actor: editor, title: post.title, markdown: `#${hashtag}` }],
      })
      const recreated = await getTestPostCategoryFinalization(post.id)
      expect(stale.generation).toBe('1')
      expect(recreated).toMatchObject({ generation: '1' })
      return stale
    })

    await reconcilePostCategoryFinalizationRows([stale])

    await expect(getTestPostCategoryFinalization(post.id)).resolves.toBeUndefined()
    const finalizedPost = (await getPostByAny(post.id))!
    expect(finalizedPost.post_hashtags).toEqual(
      expect.arrayContaining([expect.objectContaining({ key: hashtag })]),
    )
  })

  it('retains and replays every editor whose alias relation remains active', async () => {
    const owner = await createTestUser()
    const firstEditor = await createTestUser({ administrator: true })
    const secondEditor = await createTestUser({ administrator: true })
    const suffix = Math.random().toString(36).slice(2, 12)
    const firstHashtag = `first-${suffix}`
    const secondHashtag = `second-${suffix}`
    const post = await createTestPost({ user: owner, title: `Multiple editors ${suffix}` })

    const pending = await withPostFinalizationLock(post.id, async () => {
      await persistTestPostCategoryFinalizationEdits({
        applyEdit: (edit, options) =>
          applyPostCategoryFinalizationEdit(edit, post.id, owner.id, options),
        edits: [
          { actor: firstEditor, title: post.title, markdown: `#${firstHashtag}` },
          {
            actor: secondEditor,
            title: post.title,
            markdown: `#${firstHashtag} #${secondHashtag}`,
          },
        ],
      })

      const pending = await getTestPostCategoryFinalization(post.id)
      expect(pending).not.toBeUndefined()
      expect(pending!.actor_user_ids).toEqual([firstEditor.id, secondEditor.id].toSorted())
      return pending!
    })
    await reconcilePostCategoryFinalizationRows([pending])

    const finalizedPost = (await getPostByAny(post.id))!
    expect(finalizedPost.post_hashtags).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: firstHashtag }),
        expect.objectContaining({ key: secondHashtag }),
      ]),
    )
  })
})

async function applyPostCategoryFinalizationEdit(
  edit: TestPostCategoryFinalizationEdit,
  postId: string,
  topicCategoryOwnerId: string,
  options: TestPostCategoryFinalizationEditOptions,
): Promise<void> {
  await syncPostHashtagCategoriesInTransaction(
    edit.actor,
    postId,
    { title: edit.title, markdown: edit.markdown },
    options,
  )
  await persistPostCategoryFinalization(
    postId,
    edit.actor.id,
    topicCategoryOwnerId,
    'update',
    options,
  )
}
