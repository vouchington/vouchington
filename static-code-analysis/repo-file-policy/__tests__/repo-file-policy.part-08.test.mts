import { describe, expect, it } from 'vitest'

import { setupRepoFilePolicyTest } from '../repo-file-policy-test-helpers.mts'

describe('repo-file-policy', () => {
  const { makeRepo, run, topicRouteConfigSource, track, trackTopicEnumSurfaces } =
    setupRepoFilePolicyTest()

  it('rejects stale topic collection route configs', async () => {
    const dir = await makeRepo()
    await trackTopicEnumSurfaces(dir, {
      backend: { topic: 'topic' },
      routes: ['topic'],
    })
    await track(dir, 'web/lib/route-configs.ts', topicRouteConfigSource({ card: 'card' }))
    await track(dir, 'web/app/(topics)/cards/page.tsx', 'export default {}\n')

    await expect(run(dir)).rejects.toMatchObject({
      code: 1,
      stdout: expect.stringContaining('topic route config values mismatch'),
    })
  })

  it('rejects swapped topic collection route config pairs', async () => {
    const dir = await makeRepo()
    await trackTopicEnumSurfaces(dir, {
      backend: { card: 'card', rewards_program: 'rewards-program' },
      routes: ['card', 'rewards-program'],
    })
    await track(
      dir,
      'web/lib/route-configs.ts',
      "export const topicRouteConfigs = {\n  cards: {\n    title: 'cards',\n    description: 'cards',\n    topicTypes: ['rewards_program'] as TopicTypes[],\n    pluralPath: 'cards',\n    singularPath: 'card',\n  },\n  'rewards-programs': {\n    title: 'rewards',\n    description: 'rewards',\n    topicTypes: ['card'] as TopicTypes[],\n    pluralPath: 'rewards-programs',\n    singularPath: 'rewards-program',\n  },\n}\n",
    )
    await track(dir, 'web/app/(topics)/cards/page.tsx', 'export default {}\n')
    await track(dir, 'web/app/(topics)/rewards-programs/page.tsx', 'export default {}\n')

    await expect(run(dir)).rejects.toMatchObject({
      code: 1,
      stdout: expect.stringContaining('topicRouteConfigs.cards maps singularPath'),
    })
  })

  it('rejects swapped topic collection route config plural paths', async () => {
    const dir = await makeRepo()
    await trackTopicEnumSurfaces(dir, {
      backend: { topic: 'topic', rss_feed: 'source' },
      routes: ['topic', 'source'],
    })
    await track(
      dir,
      'web/lib/route-configs.ts',
      "export const topicRouteConfigs = {\n  topics: {\n    title: 'topics',\n    description: 'topics',\n    topicTypes: ['topic'] as TopicTypes[],\n    pluralPath: 'sources',\n    singularPath: 'topic',\n  },\n  sources: {\n    title: 'sources',\n    description: 'sources',\n    topicTypes: ['rss_feed'] as TopicTypes[],\n    pluralPath: 'topics',\n    singularPath: 'source',\n  },\n}\n",
    )
    await track(dir, 'web/app/(topics)/topics/page.tsx', 'export default {}\n')
    await track(dir, 'web/app/(topics)/sources/page.tsx', 'export default {}\n')

    await expect(run(dir)).rejects.toMatchObject({
      code: 1,
      stdout: expect.stringContaining('topicRouteConfigs.topics has pluralPath'),
    })
  })

  it('ties untyped source collection route configs to rss_feed', async () => {
    const dir = await makeRepo()
    await trackTopicEnumSurfaces(dir, {
      backend: { topic: 'topic', rss_feed: 'source' },
      routes: ['topic', 'source'],
    })
    await track(
      dir,
      'web/lib/route-configs.ts',
      "export const topicRouteConfigs = {\n  sources: {\n    title: 'Sources',\n    description: 'Sources',\n    topicTypes: undefined,\n    pluralPath: 'sources',\n    singularPath: 'source',\n  },\n}\n",
    )
    await track(dir, 'web/app/(topics)/sources/page.tsx', 'export default {}\n')

    await expect(run(dir)).rejects.toMatchObject({
      code: 1,
      stdout: expect.stringContaining('topicRouteConfigs.sources has singularPath "source"'),
    })
  })

  it('rejects stale topic collection route directories', async () => {
    const dir = await makeRepo()
    await trackTopicEnumSurfaces(dir, {
      backend: { topic: 'topic' },
      routes: ['topic'],
    })
    await track(dir, 'web/lib/route-configs.ts', topicRouteConfigSource({ topic: 'topic' }))
    await track(dir, 'web/app/(topics)/topics/page.tsx', 'export default {}\n')
    await track(dir, 'web/app/(topics)/cards/page.tsx', 'export default {}\n')

    await expect(run(dir)).rejects.toMatchObject({
      code: 1,
      stdout: expect.stringContaining('topic collection routed pages mismatch'),
    })
  })

  it('rejects stale topic collection page path literals', async () => {
    const dir = await makeRepo()
    await trackTopicEnumSurfaces(dir, {
      backend: { rss_feed: 'source' },
      routes: ['source'],
    })
    await track(dir, 'web/lib/route-configs.ts', topicRouteConfigSource({ rss_feed: 'source' }))
    await track(
      dir,
      'web/app/(topics)/sources/create/page.tsx',
      "const breadcrumbs = [{ name: 'Home', path: '/' }, { name: 'Sources', path: '/feeds' }]\nexport default {}\n",
    )
    await track(dir, 'web/app/(topics)/sources/page.tsx', 'export default {}\n')

    await expect(run(dir)).rejects.toMatchObject({
      code: 1,
      stdout: expect.stringContaining(
        'topics collection path literal "/feeds" does not match route directory "sources"',
      ),
    })
  })

  it('rejects stale topic collection component navigation literals', async () => {
    const dir = await makeRepo()
    await trackTopicEnumSurfaces(dir, {
      backend: { rss_feed: 'source' },
      routes: ['source'],
    })
    await track(dir, 'web/lib/route-configs.ts', topicRouteConfigSource({ rss_feed: 'source' }))
    await track(dir, 'web/app/(topics)/sources/page.tsx', 'export default {}\n')
    await track(
      dir,
      'web/components/sources/create-source-form.tsx',
      'export function CreateSourceForm() {\n  push(`/feed/${result.topic_slug}`)\n}\n',
    )

    await expect(run(dir)).rejects.toMatchObject({
      code: 1,
      stdout: expect.stringContaining(
        'topic component navigation path "/feed/" does not match route config "source" or "sources"',
      ),
    })
  })

  it('ignores commented topic route config blocks', async () => {
    const dir = await makeRepo()
    await trackTopicEnumSurfaces(dir, {
      backend: { topic: 'topic' },
      routes: ['topic'],
    })
    await track(
      dir,
      'web/lib/route-configs.ts',
      "export const topicRouteConfigs = {\n  topics: {\n    title: 'topic',\n    description: 'topic',\n    topicTypes: ['topic'] as TopicTypes[],\n    pluralPath: 'topics',\n    singularPath: 'topic',\n  },\n  /* cards: {\n    title: 'card',\n    description: 'card',\n    topicTypes: ['card'] as TopicTypes[],\n    pluralPath: 'cards',\n    singularPath: 'card',\n  }, */\n}\n",
    )
    await track(dir, 'web/app/(topics)/topics/page.tsx', 'export default {}\n')

    await expect(run(dir)).resolves.toMatchObject({
      stdout: expect.stringContaining('pass'),
    })
  })
})
