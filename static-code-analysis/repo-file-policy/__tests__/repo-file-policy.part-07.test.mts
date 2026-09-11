import { rm } from 'node:fs/promises'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  parseTopicTypeEntries,
  setupRepoFilePolicyTest,
} from '../repo-file-policy-test-helpers.mts'

describe('repo-file-policy', () => {
  const { makeRepo, run, track, trackTopicEnumSurfaces } = setupRepoFilePolicyTest()

  it('rejects backend/web topicTypes slugPlural mismatches', { timeout: 10_000 }, async () => {
    const dir = await makeRepo()
    await trackTopicEnumSurfaces(dir, {
      backend: { topic: 'topic', card: 'card' },
      routes: ['topic', 'card'],
    })
    await track(
      dir,
      'web/types/topics.ts',
      "export const topicTypes = {\n  topic: {\n    slug: 'topic',\n    slugPlural: 'topics',\n    sitemap: true,\n  },\n  card: {\n    slug: 'card',\n    slugPlural: 'payment-cards',\n    sitemap: true,\n  },\n} as const\n",
    )

    await expect(run(dir)).rejects.toMatchObject({
      code: 1,
      stdout: expect.stringContaining('topicTypes.card.slugPlural is "payment-cards"'),
    })
  })

  it('ignores commented topicTypes entries', { timeout: 10_000 }, async () => {
    const dir = await makeRepo()
    await trackTopicEnumSurfaces(dir, {
      backend: { topic: 'topic' },
      routes: ['topic'],
    })
    await track(
      dir,
      'web/types/topics.ts',
      "export const topicTypes = {\n  topic: {\n    slug: 'topic',\n    slugPlural: 'topics',\n    sitemap: true,\n  },\n  /* card: {\n    slug: 'card',\n    slugPlural: 'cards',\n    sitemap: true,\n  }, */\n} as const\n",
    )

    await expect(run(dir)).resolves.toMatchObject({
      stdout: expect.stringContaining('pass'),
    })
  })

  it('rejects unterminated topicTypes objects', () => {
    expect(() =>
      parseTopicTypeEntries('export const topicTypes = {\n  topic: {\n', 'web/types/topics.ts'),
    ).toThrow('web/types/topics.ts: could not find end of topicTypes')
  })

  it('rejects stale topic route directories after a topic type is removed', async () => {
    const dir = await makeRepo()
    await trackTopicEnumSurfaces(dir, {
      backend: { topic: 'topic' },
      routes: ['topic', 'person'],
    })

    await expect(run(dir)).rejects.toMatchObject({
      code: 1,
      stdout: expect.stringContaining('topic route directories mismatch'),
    })
  })

  it('rejects stale nested topic routes after the topic layout is removed', async () => {
    const dir = await makeRepo()
    await trackTopicEnumSurfaces(dir, {
      backend: { topic: 'topic' },
      routes: ['topic'],
    })
    await track(dir, 'web/app/(topics)/person/[id]/settings/about/page.tsx', 'export default {}\n')

    await expect(run(dir)).rejects.toMatchObject({
      code: 1,
      stdout: expect.stringContaining('topic routed pages mismatch'),
    })
  })

  it('rejects topic routes with only nested pages and no top-level detail page', async () => {
    const dir = await makeRepo()
    await trackTopicEnumSurfaces(dir, {
      backend: { topic: 'topic' },
      routes: [],
    })
    await track(
      dir,
      'web/app/(topics)/topic/[id]/settings/page.tsx',
      "const { default: Page } = createTopicSettingsPage('topic')\nexport default Page\n",
    )

    await expect(run(dir)).rejects.toMatchObject({
      code: 1,
      stdout: expect.stringContaining('topic route directories mismatch'),
    })
  })

  it('rejects missing topic route directories when none are found', async () => {
    const dir = await makeRepo()
    await trackTopicEnumSurfaces(dir, {
      backend: { topic: 'topic' },
      routes: [],
    })

    await expect(run(dir)).rejects.toMatchObject({
      code: 1,
      stdout: expect.stringContaining('topic route directories mismatch'),
    })
  })

  it('rejects topic routes with only a layout and no page', async () => {
    const dir = await makeRepo()
    await trackTopicEnumSurfaces(dir, {
      backend: { topic: 'topic' },
      routes: [],
    })
    await track(dir, 'web/app/(topics)/topic/[id]/layout.tsx', 'export default {}\n')

    await expect(run(dir)).rejects.toMatchObject({
      code: 1,
      stdout: expect.stringContaining('topic route directories mismatch'),
    })
  })

  it('rejects stale topic route factory slugs', async () => {
    const dir = await makeRepo()
    await trackTopicEnumSurfaces(dir, {
      backend: { topic: 'topic', card: 'card' },
      routes: ['topic', 'card'],
    })
    await track(
      dir,
      'web/app/(topics)/card/[id]/posts/page.tsx',
      "const { default: Page } = createTopicPostsPage('topic')\nexport default Page\n",
    )

    await expect(run(dir)).rejects.toMatchObject({
      code: 1,
      stdout: expect.stringContaining('topic route factory slug mismatch'),
    })
  })

  it('ignores tracked-but-deleted topic route files', async () => {
    const dir = await makeRepo()
    await trackTopicEnumSurfaces(dir, {
      backend: { topic: 'topic' },
      routes: ['topic'],
    })
    const staleRoute = 'web/app/(topics)/person/[id]/settings/about/page.tsx'
    await track(dir, staleRoute, 'export default {}\n')
    await rm(join(dir, staleRoute))

    await expect(run(dir)).resolves.toMatchObject({
      stdout: expect.stringContaining('pass'),
    })
  })

  it('rejects duplicate topic type slugs', async () => {
    const dir = await makeRepo()
    await trackTopicEnumSurfaces(dir, {
      backend: { topic: 'topic', card: 'topic' },
      routes: ['topic'],
    })

    await expect(run(dir)).rejects.toMatchObject({
      code: 1,
      stdout: expect.stringContaining(
        'topic route directories duplicate in expected values: topic',
      ),
    })
  })
})
