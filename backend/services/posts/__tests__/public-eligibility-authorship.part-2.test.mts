import { describe, expect, it } from 'vitest'

import {
  createSystemUser,
  createTestUser,
  getPostIdsByCandidateRootFilter,
  insertTestPost,
  insertTestUrlDirect,
  isPostInPublicEligibilityView,
} from '@voucha/test-helpers'
import { buildPublicPostEligibilityFilter } from '@modules/feed-query-builders'

const suffix = () => Math.random().toString(36).slice(2, 10)

describe('buildPublicPostEligibilityFilter — authorship and type/state cross', () => {
  it('keeps administrator and system-authored public rows equivalent to the persisted view', async () => {
    const id = suffix()
    const administrator = await createTestUser({
      username: `public-admin-${id}`,
      administrator: true,
    })
    if (!administrator) throw new Error('Failed to create test administrator')
    const system = await createSystemUser(`public-system-${id}`)
    const postIds = await Promise.all([
      insertTestPost({
        createdById: administrator.id,
        title: `administrator article ${id}`,
        slug: `administrator-article-${id}`,
        markdown: 'public',
        postType: 'article',
      }),
      insertTestPost({
        createdById: administrator.id,
        title: `administrator blog ${id}`,
        slug: `administrator-blog-${id}`,
        markdown: 'public',
        postType: 'blog_post',
      }),
      insertTestPost({
        createdById: system.id,
        title: `system discussion ${id}`,
        slug: `system-discussion-${id}`,
        markdown: 'public',
      }),
    ])
    for (const postId of postIds) await expect(isPubliclyEligible(postId)).resolves.toBe(true)
  })

  it('makes the public type, publication state, root, and audience cross explicit', async () => {
    const id = suffix()
    const author = await createTestUser({ username: `public-cross-${id}` })
    if (!author) throw new Error('Failed to create test author')
    const linkUrl = await insertTestUrlDirect(null, `https://public-cross-${id}.example.com`)
    if (!linkUrl) throw new Error('Failed to create link URL')
    const makePost = (
      postType: NonNullable<Parameters<typeof insertTestPost>[0]['postType']>,
      overrides = {},
    ) =>
      insertTestPost({
        createdById: author.id,
        title: `${postType} ${id}`,
        slug: `${postType.replace('_', '-')}-${id}-${Math.random().toString(36).slice(2, 5)}`,
        markdown: 'public',
        postType,
        ...overrides,
      })
    const publicRows = await Promise.all([
      makePost('discussion'),
      makePost('review'),
      makePost('data_point'),
      makePost('link', { urlId: linkUrl.id }),
    ])
    for (const postId of publicRows) await expect(isPubliclyEligible(postId)).resolves.toBe(true)

    const privateRootId = await makePost('discussion', {
      privacy: 'private',
      broadcast: 'users',
    })
    const candidateOnPrivateRootId = await makePost('comment', {
      rootId: privateRootId,
      parentId: privateRootId,
    })
    await expect(isPubliclyEligible(candidateOnPrivateRootId)).resolves.toBe(false)
    await expect(
      isPubliclyEligible(await makePost('discussion', { broadcast: 'users' })),
    ).resolves.toBe(false)
    await expect(isPubliclyEligible(await makePost('story', { markdown: '' }))).resolves.toBe(false)
  })
})

async function isPubliclyEligible(postId: string): Promise<boolean> {
  const filter = buildPublicPostEligibilityFilter('candidate_post', 'access_post')
  const [builderResult, viewResult] = await Promise.all([
    getPostIdsByCandidateRootFilter(filter).then(ids => ids.includes(postId)),
    isPostInPublicEligibilityView(postId),
  ])
  expect(viewResult).toBe(builderResult)
  return builderResult
}
