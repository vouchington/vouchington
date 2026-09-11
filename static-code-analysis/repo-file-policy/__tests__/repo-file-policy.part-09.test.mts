import { rm } from 'node:fs/promises'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { setupRepoFilePolicyTest } from '../repo-file-policy-test-helpers.mts'

describe('repo-file-policy', () => {
  const { makeRepo, run, track, trackPostEnumSurfaces } = setupRepoFilePolicyTest()

  it('ignores commented PostType union members and post slug mappings', async () => {
    const dir = await makeRepo()
    await trackPostEnumSurfaces(dir, {
      postTypes: ['discussion', 'review', 'comment', 'topic_recommendation'],
    })
    await track(
      dir,
      'backend/types/entities/post.mts',
      "export type PostType =\n  | 'discussion'\n  // | 'story'\n  | 'review'\n  | 'comment'\n  | 'topic_recommendation'\nexport type PostBroadcast = 'everyone'\n",
    )
    await track(
      dir,
      'web/lib/route-configs.ts',
      "const postSlugToType: Record<string, PostType> = {\n  discussion: 'discussion',\n  // story: 'story',\n  review: 'review',\n}\n",
    )

    await expect(run(dir)).resolves.toMatchObject({
      stdout: expect.stringContaining('pass'),
    })
  })

  it('rejects stale public post route config values after a post type is removed', async () => {
    const dir = await makeRepo()
    await trackPostEnumSurfaces(dir, {
      postTypes: ['discussion', 'review', 'comment', 'topic_recommendation'],
      routeConfig: {
        discussion: 'discussion',
        review: 'review',
        story: 'story',
      },
    })

    await expect(run(dir)).rejects.toMatchObject({
      code: 1,
      stdout: expect.stringContaining('public post route config values mismatch'),
    })
  })

  it('rejects stale public post route directories after route config is updated', async () => {
    const dir = await makeRepo()
    await trackPostEnumSurfaces(dir, {
      postTypes: ['discussion', 'review', 'comment', 'topic_recommendation'],
      routes: ['discussion', 'review', 'story'],
    })

    await expect(run(dir)).rejects.toMatchObject({
      code: 1,
      stdout: expect.stringContaining('public post route directories mismatch'),
    })
  })

  it('rejects stale nested public post route directories', { timeout: 30_000 }, async () => {
    const dir = await makeRepo()
    await trackPostEnumSurfaces(dir, {
      postTypes: ['discussion', 'review', 'comment', 'topic_recommendation'],
      routes: ['discussion', 'review'],
    })
    await track(
      dir,
      'web/app/(posts)/story/[id]/comment/[commentId]/page.tsx',
      'export default {}\n',
    )

    await expect(run(dir)).rejects.toMatchObject({
      code: 1,
      stdout: expect.stringContaining('public post routed pages mismatch'),
    })
  })

  it('rejects public post routes with only nested pages and no top-level detail page', async () => {
    const dir = await makeRepo()
    await trackPostEnumSurfaces(dir, {
      postTypes: ['discussion', 'review', 'comment', 'topic_recommendation'],
      routes: ['discussion'],
    })
    await track(
      dir,
      'web/app/(posts)/review/[id]/comment/[commentId]/page.tsx',
      "const { default: Page } = createCommentPermalinkPage('review', 'review')\nexport default Page\n",
    )

    await expect(run(dir)).rejects.toMatchObject({
      code: 1,
      stdout: expect.stringContaining('public post route directories mismatch'),
    })
  })

  it('rejects stale public post collection route configs', async () => {
    const dir = await makeRepo()
    await trackPostEnumSurfaces(dir, {
      postTypes: ['discussion', 'review', 'comment', 'topic_recommendation'],
      routeConfig: {
        discussion: 'discussion',
        review: 'review',
        story: 'story',
      },
      collectionRoutes: ['discussions', 'reviews', 'stories'],
    })

    await expect(run(dir)).rejects.toMatchObject({
      code: 1,
      stdout: expect.stringContaining('public post collection route config values mismatch'),
    })
  })

  it('rejects untyped public post collection route configs', async () => {
    const dir = await makeRepo()
    await trackPostEnumSurfaces(dir, {
      postTypes: ['discussion', 'review', 'comment', 'topic_recommendation'],
      routes: ['discussion', 'review'],
      collectionRoutes: ['discussions', 'reviews'],
    })
    await track(
      dir,
      'web/lib/route-configs.ts',
      "export const postRouteConfigs = {\n  posts: {\n    title: 'posts',\n    description: 'posts',\n    postTypes: undefined,\n    pluralPath: 'posts',\n    singularPath: 'post',\n  },\n  reviews: {\n    title: 'reviews',\n    description: 'reviews',\n    postTypes: undefined,\n    pluralPath: 'reviews',\n    singularPath: 'review',\n  },\n}\nconst postSlugToType: Record<string, PostType> = {\n  discussion: 'discussion',\n  review: 'review',\n}\n",
    )

    await expect(run(dir)).rejects.toMatchObject({
      code: 1,
      stdout: expect.stringContaining('postRouteConfigs.reviews has singularPath'),
    })
  })

  it('rejects stale public post collection route directories', async () => {
    const dir = await makeRepo()
    await trackPostEnumSurfaces(dir, {
      postTypes: ['discussion', 'review', 'comment', 'topic_recommendation'],
      collectionRoutes: ['discussions', 'reviews', 'stories'],
    })

    await expect(run(dir)).rejects.toMatchObject({
      code: 1,
      stdout: expect.stringContaining('public post collection routed pages mismatch'),
    })
  })

  it('rejects stale nested public post collection routes', { timeout: 30_000 }, async () => {
    const dir = await makeRepo()
    await trackPostEnumSurfaces(dir, {
      postTypes: ['discussion', 'review', 'comment', 'topic_recommendation'],
    })
    await track(dir, 'web/app/(posts)/stories/create/page.tsx', 'export default {}\n')

    await expect(run(dir)).rejects.toMatchObject({
      code: 1,
      stdout: expect.stringContaining('public post collection routed pages mismatch'),
    })
  })

  it('rejects missing top-level public post collection pages', { timeout: 30_000 }, async () => {
    const dir = await makeRepo()
    await trackPostEnumSurfaces(dir, {
      postTypes: ['discussion', 'review', 'comment', 'topic_recommendation'],
      collectionRoutes: ['discussions', 'reviews'],
    })
    await rm(join(dir, 'web/app/(posts)/reviews/page.tsx'))
    await track(dir, 'web/app/(posts)/reviews/create/page.tsx', 'export default {}\n')

    await expect(run(dir)).rejects.toMatchObject({
      code: 1,
      stdout: expect.stringContaining(
        'public post top-level collection route directories mismatch',
      ),
    })
  })
})
