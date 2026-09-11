import { describe, expect, it } from 'vitest'

import { setupRepoFilePolicyTest } from '../repo-file-policy-test-helpers.mts'

describe('repo-file-policy', () => {
  const { makeRepo, run, track, trackPostEnumSurfaces } = setupRepoFilePolicyTest()

  it('rejects stale page.ts public post collection routes', async () => {
    const dir = await makeRepo()
    await trackPostEnumSurfaces(dir, {
      postTypes: ['discussion', 'review', 'comment', 'topic_recommendation'],
    })
    await track(dir, 'web/app/(posts)/stories/create/page.ts', 'export default {}\n')

    await expect(run(dir)).rejects.toMatchObject({
      code: 1,
      stdout: expect.stringContaining('public post collection routed pages mismatch'),
    })
  })

  it('rejects stale public post collection page path literals', async () => {
    const dir = await makeRepo()
    await trackPostEnumSurfaces(dir, {
      postTypes: ['discussion', 'review', 'comment', 'topic_recommendation'],
    })
    await track(
      dir,
      'web/app/(posts)/reviews/page.tsx',
      "export const metadata = { path: '/stories' }\nexport default {}\n",
    )

    await expect(run(dir)).rejects.toMatchObject({
      code: 1,
      stdout: expect.stringContaining(
        'posts collection path literal "/stories" does not match route directory "reviews"',
      ),
    })
  })

  it('rejects stale public post create page type literals', async () => {
    const dir = await makeRepo()
    await trackPostEnumSurfaces(dir, {
      postTypes: ['discussion', 'review', 'comment', 'topic_recommendation'],
    })
    await track(
      dir,
      'web/app/(posts)/reviews/create/page.tsx',
      'const status = getMyContributionStatus({ action: "discussion" })\nexport default function Page() { return <PostForm postType="discussion" /> }\n',
    )

    await expect(run(dir)).rejects.toMatchObject({
      code: 1,
      stdout: expect.stringContaining(
        'post create page literal uses "discussion" but reviews expects "review"',
      ),
    })
  })

  it('rejects stale public post detail route factory slugs', async () => {
    const dir = await makeRepo()
    await trackPostEnumSurfaces(dir, {
      postTypes: ['discussion', 'review', 'comment', 'topic_recommendation'],
      routes: ['discussion', 'review'],
    })
    await track(
      dir,
      'web/app/(posts)/review/[id]/page.tsx',
      "import { createPostDetailPage } from '@/lib/routes/post-route-factories'\nconst { default: Page } = createPostDetailPage('review', 'story')\nexport default Page\n",
    )

    await expect(run(dir)).rejects.toMatchObject({
      code: 1,
      stdout: expect.stringContaining('public post route factory slugs mismatch'),
    })
  })

  it('rejects swapped public post detail route factory pairs', async () => {
    const dir = await makeRepo()
    await trackPostEnumSurfaces(dir, {
      postTypes: ['discussion', 'review', 'comment', 'topic_recommendation'],
      routes: ['discussion', 'review'],
    })
    await track(
      dir,
      'web/app/(posts)/review/[id]/page.tsx',
      "const { default: Page } = createPostDetailPage('discussion', 'review')\nexport default Page\n",
    )

    await expect(run(dir)).rejects.toMatchObject({
      code: 1,
      stdout: expect.stringContaining('post route factory args mismatch'),
    })
  })

  it('rejects stale nested public post route factory slugs', async () => {
    const dir = await makeRepo()
    await trackPostEnumSurfaces(dir, {
      postTypes: ['discussion', 'review', 'comment', 'topic_recommendation'],
      routes: ['discussion', 'review'],
    })
    await track(
      dir,
      'web/app/(posts)/review/[id]/comment/[commentId]/page.tsx',
      "const { default: Page } = createCommentPermalinkPage('review', 'story')\nexport default Page\n",
    )

    await expect(run(dir)).rejects.toMatchObject({
      code: 1,
      stdout: expect.stringContaining('post route factory args mismatch'),
    })
  })

  it('ignores commented public post route factory calls', async () => {
    const dir = await makeRepo()
    await trackPostEnumSurfaces(dir, {
      postTypes: ['discussion', 'review', 'comment', 'topic_recommendation'],
      routes: ['discussion', 'review'],
    })
    await track(
      dir,
      'web/app/(posts)/review/[id]/page.tsx',
      "const { default: Page } = createPostDetailPage('review', 'review')\n// const stale = createPostDetailPage('story', 'story')\nexport default Page\n",
    )

    await expect(run(dir)).resolves.toMatchObject({
      stdout: expect.stringContaining('pass'),
    })
  })

  it('rejects swapped public post collection route config pairs', async () => {
    const dir = await makeRepo()
    await trackPostEnumSurfaces(dir, {
      postTypes: ['discussion', 'review', 'comment', 'topic_recommendation'],
      routes: ['discussion', 'review'],
      collectionRoutes: ['discussions', 'reviews'],
    })
    await track(
      dir,
      'web/lib/route-configs.ts',
      "export const postRouteConfigs = {\n  discussions: {\n    title: 'discussions',\n    description: 'discussions',\n    postTypes: ['review'] as PostType[],\n    pluralPath: 'discussions',\n    singularPath: 'discussion',\n  },\n  reviews: {\n    title: 'reviews',\n    description: 'reviews',\n    postTypes: ['discussion'] as PostType[],\n    pluralPath: 'reviews',\n    singularPath: 'review',\n  },\n}\nconst postSlugToType: Record<string, PostType> = {\n  discussion: 'discussion',\n  review: 'review',\n}\n",
    )

    await expect(run(dir)).rejects.toMatchObject({
      code: 1,
      stdout: expect.stringContaining('postRouteConfigs.discussions maps singularPath'),
    })
  })

  it('rejects swapped public post collection route config plural paths', async () => {
    const dir = await makeRepo()
    await trackPostEnumSurfaces(dir, {
      postTypes: ['discussion', 'review', 'comment', 'topic_recommendation'],
      routes: ['discussion', 'review'],
      collectionRoutes: ['discussions', 'reviews'],
    })
    await track(
      dir,
      'web/lib/route-configs.ts',
      "export const postRouteConfigs = {\n  discussions: {\n    title: 'discussions',\n    description: 'discussions',\n    postTypes: ['discussion'] as PostType[],\n    pluralPath: 'reviews',\n    singularPath: 'discussion',\n  },\n  reviews: {\n    title: 'reviews',\n    description: 'reviews',\n    postTypes: ['review'] as PostType[],\n    pluralPath: 'discussions',\n    singularPath: 'review',\n  },\n}\nconst postSlugToType: Record<string, PostType> = {\n  discussion: 'discussion',\n  review: 'review',\n}\n",
    )

    await expect(run(dir)).rejects.toMatchObject({
      code: 1,
      stdout: expect.stringContaining('postRouteConfigs.discussions has pluralPath'),
    })
  })
})
