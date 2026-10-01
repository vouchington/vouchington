import { describe, expect, it } from 'vitest'
import {
  createTestUser,
  insertTestImage,
  insertTestPost,
  insertTestPostImage,
} from '@voucha/test-helpers'
import { createCopyrightFormIntake } from './index.mts'

async function guestIntake(target: { postId: string; imageId: string }) {
  const idempotencyKey = crypto.randomUUID()
  const request = {
    jurisdiction: 'us_dmca' as const,
    claimantDisplayName: null,
    claimantContact: 'guest@example.test',
    claimantEmail: 'guest@example.test',
    workDescription: 'A photograph owned by the guest claimant.',
    goodFaithBelief: true,
    accuracyAuthorityUnderPenaltyOfPerjury: true,
    electronicSignature: 'Guest claimant',
    claimantTargets: [{ ...target, hostedUseUrl: 'https://voucha.ai/posts/target' }],
  }
  const attempt = () =>
    createCopyrightFormIntake({
      requesterUserId: null,
      requesterIdentity: `guest:${crypto.randomUUID()}`,
      idempotencyKey,
      request,
    })
  return attempt()
}

describe('guest copyright form intakes naming a post that is not publicly visible', () => {
  it.each([
    ['private', { privacy: 'private', broadcast: 'users' }],
    ['draft', { clearanceStatus: 'pending' }],
  ] as const)('rejects a %s post exactly like a missing target', async (_name, visibility) => {
    const poster = await createTestUser()
    const [postId, imageId] = await Promise.all([
      insertTestPost({
        title: `copyright non-public ${crypto.randomUUID()}`,
        slug: `copyright-non-public-${crypto.randomUUID()}`,
        createdById: poster.id,
        markdown: 'image',
        ...visibility,
      }),
      insertTestImage(poster.id),
    ])
    await insertTestPostImage({ postId, imageId })

    const missing = await guestIntake({
      postId: crypto.randomUUID(),
      imageId: crypto.randomUUID(),
    }).catch((error: unknown) => error)
    const nonPublic = await guestIntake({ postId, imageId }).catch((error: unknown) => error)

    expect(missing).toMatchObject({ status: 422, message: 'Hosted image placement was not found' })
    expect(nonPublic).toMatchObject({ status: 422, expose: true })
    expect(nonPublic).toEqual(missing)
  })
})
