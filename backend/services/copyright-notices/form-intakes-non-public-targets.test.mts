import { describe, expect, it } from 'vitest'
import {
  deleteTestPost,
  insertTestImage,
  insertTestPost,
  insertTestPostImage,
} from '@voucha/test-helpers'
import {
  createHostedImagePost,
  type HostedPostAudience,
} from '@voucha/test-helpers/services/copyright-notices/hosted-post-audience'
import type { PrivateUser } from '@services/users/types'
import { createCopyrightFormIntake } from './index.mts'

type Target = { postId: string; imageId: string }

const NOT_FOUND = { status: 422, message: 'Hosted image placement was not found' }

function submit(
  currentUser: PrivateUser | null,
  targets: Target[],
  { idempotencyKey = crypto.randomUUID(), identity = `guest:${crypto.randomUUID()}` } = {},
) {
  return createCopyrightFormIntake({
    currentUser,
    requesterIdentity: currentUser ? `user:${currentUser.id}` : identity,
    idempotencyKey,
    request: {
      jurisdiction: 'us_dmca',
      claimantDisplayName: null,
      claimantContact: 'claimant@example.test',
      claimantEmail: 'claimant@example.test',
      workDescription: 'A photograph owned by the claimant.',
      goodFaithBelief: true,
      accuracyAuthorityUnderPenaltyOfPerjury: true,
      electronicSignature: 'Claimant',
      claimantTargets: targets.map(target => ({
        ...target,
        hostedUseUrl: `https://voucha.ai/posts/${target.postId}`,
      })),
    },
  })
}

async function addCommentImage(root: { poster: PrivateUser; postId: string }): Promise<Target> {
  const postId = await insertTestPost({
    title: `copyright comment ${crypto.randomUUID()}`,
    slug: `copyright-comment-${crypto.randomUUID()}`,
    createdById: root.poster.id,
    markdown: 'A comment carrying a hosted image.',
    postType: 'comment',
    rootId: root.postId,
    parentId: root.postId,
  })
  const imageId = await insertTestImage(root.poster.id)
  await insertTestPostImage({ postId, imageId })
  return { postId, imageId }
}

const failure = (attempt: Promise<unknown>) => attempt.catch((err: unknown) => err)
const missingTarget = (): Target => ({ postId: crypto.randomUUID(), imageId: crypto.randomUUID() })

describe('guest copyright form intakes', () => {
  it('accepts a post anyone can view', async () => {
    const { postId, imageId } = await createHostedImagePost('public')
    const { isDuplicate } = await submit(null, [{ postId, imageId }])
    expect(isDuplicate).toBe(false)
  })

  it.each([
    'users',
    'followers',
    'private-community',
    'awaiting-community-review',
    'draft',
  ] satisfies HostedPostAudience[])(
    'rejects a %s post exactly like a missing target',
    async audience => {
      const { postId, imageId } = await createHostedImagePost(audience, { claimantHasAccess: true })

      const missing = await failure(submit(null, [missingTarget()]))
      const hidden = await failure(submit(null, [{ postId, imageId }]))

      expect(missing).toMatchObject({ ...NOT_FOUND, expose: true })
      expect(hidden).toEqual(missing)
    },
  )
})

describe('signed-in copyright form intakes', () => {
  it('lets an author name their own unapproved draft', async () => {
    const { poster, postId, imageId } = await createHostedImagePost('draft')
    const { isDuplicate } = await submit(poster, [{ postId, imageId }])
    expect(isDuplicate).toBe(false)
  })

  it('rejects the whole notice when any one target is hidden from the claimant', async () => {
    const visible = await createHostedImagePost('followers', { claimantHasAccess: true })
    const hidden = await createHostedImagePost('draft')

    const mixed = await failure(
      submit(visible.claimant, [
        { postId: visible.postId, imageId: visible.imageId },
        { postId: hidden.postId, imageId: hidden.imageId },
      ]),
    )

    expect(mixed).toMatchObject({ ...NOT_FOUND, expose: true })
  })

  it('answers a replay of an accepted notice even after the claimant can no longer view the post', async () => {
    const { claimant, postId, imageId } = await createHostedImagePost('public')
    const idempotencyKey = crypto.randomUUID()
    const first = await submit(claimant, [{ postId, imageId }], { idempotencyKey })

    await deleteTestPost(postId)
    const replay = await submit(claimant, [{ postId, imageId }], { idempotencyKey })

    expect(replay).toMatchObject({ isDuplicate: true, intake: { id: first.intake.id } })
  })

  it('answers a hidden comment image like a missing target, before the comment routing check', async () => {
    const root = await createHostedImagePost('followers')
    const hidden = await failure(submit(root.claimant, [await addCommentImage(root)]))
    expect(hidden).toEqual(await failure(submit(root.claimant, [missingTarget()])))
  })

  it('reports the comment routing error only to a claimant who can view the thread', async () => {
    const root = await createHostedImagePost('followers', { claimantHasAccess: true })
    const error = await failure(submit(root.claimant, [await addCommentImage(root)]))
    expect(error).toMatchObject({
      status: 422,
      message: 'Hosted image placement does not have a public post route',
    })
  })
})
